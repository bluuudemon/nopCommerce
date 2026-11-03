using AwesomeAssertions;
using Nop.Core.Domain.Directory;
using Nop.Plugin.Payments.PayPalCommerce.Services;
using Nop.Plugin.Payments.PayPalCommerce.Services.Api.Models;
using Nop.Services.Catalog;
using NUnit.Framework;

namespace Nop.Plugin.Payments.PayPalCommerce.Tests;

/// <summary>
/// Proves the PayPal Commerce fraud guard: the approved order amount and the shopping cart total
/// match to the cent, including carts whose total was reduced by a negative line.
/// </summary>
[TestFixture]
public class PayPalCommerceTotalReconciliationTests
{
    private const string CurrencyCode = "USD";

    // A negative line large enough that every cash RoundingType still reduces the total.
    private const decimal UnitPrice = 10.03m;
    private const int Quantity = 2;
    private const decimal Shipping = 1.27m;
    private const decimal Tax = 0.49m;
    private const decimal NegativeAmount = 1.11m;

    // Round() does not use instance state.
    private static readonly PriceCalculationService _priceCalculator = new(
        catalogSettings: null,
        currencySettings: null,
        categoryService: null,
        currencyService: null,
        customerService: null,
        discountService: null,
        manufacturerService: null,
        priceListService: null,
        productAttributeParser: null,
        productService: null,
        staticCacheManager: null);

    public enum NegativeLine
    {
        OrderSubtotalDiscount,
        GiftCard,
        RewardPoints
    }

    public static IEnumerable<TestCaseData> RoundingAndNegativeLines()
    {
        foreach (RoundingType roundingType in Enum.GetValues<RoundingType>())
        {
            foreach (NegativeLine line in Enum.GetValues<NegativeLine>())
                yield return new TestCaseData(roundingType, line);
        }
    }

    [Test]
    public void Equal_approved_amount_and_cart_total_differ_by_zero()
    {
        var approved = PayPalCommerceServiceManager.PrepareMoney(10.00m, CurrencyCode);

        PayPalCommerceServiceManager.GetApprovedAmountDifference(approved, 10.00m).Should().Be(0m);
    }

    [Test]
    public void Approved_amount_one_cent_above_the_cart_total_differs_by_one_cent()
    {
        var approved = PayPalCommerceServiceManager.PrepareMoney(10.01m, CurrencyCode);
        var difference = PayPalCommerceServiceManager.GetApprovedAmountDifference(approved, 10.00m);

        difference.Should().Be(0.01m);
        // PlaceOrderAsync throws when the difference is greater than zero. There is no tolerance.
        (difference > decimal.Zero).Should().BeTrue();
    }

    [Test]
    public void Approved_amount_one_cent_below_the_cart_total_differs_by_one_cent()
    {
        var approved = PayPalCommerceServiceManager.PrepareMoney(10.00m, CurrencyCode);
        var difference = PayPalCommerceServiceManager.GetApprovedAmountDifference(approved, 10.01m);

        difference.Should().Be(0.01m);
        (difference > decimal.Zero).Should().BeTrue();
    }

    [Test]
    public void Null_cart_total_is_treated_as_zero()
    {
        var approved = PayPalCommerceServiceManager.PrepareMoney(0.01m, CurrencyCode);

        PayPalCommerceServiceManager.GetApprovedAmountDifference(approved, null).Should().Be(0.01m);
    }

    [TestCaseSource(nameof(RoundingAndNegativeLines))]
    public void Approved_paypal_amount_matches_cart_total_to_the_cent(RoundingType roundingType, NegativeLine negativeLine)
    {
        var grossTotal = CartTotal(roundingType, negativeLine: null);
        var cartTotal = CartTotal(roundingType, negativeLine);

        // The negative line has to participate. A case that rounds it away would not test reconciliation.
        cartTotal.Should().BeLessThan(grossTotal);

        // PrepareOrderMoneyAsync sets the approved amount to PrepareMoney(cartTotal). The fraud guard then
        // compares that amount with Math.Round(cartTotal, 2). Cash rounding, including a sign-asymmetric
        // Round of a negative value, changes the cart total itself; both sides of this check move together.
        var approved = BuildApprovedOrderMoney(roundingType, cartTotal);
        var difference = PayPalCommerceServiceManager.GetApprovedAmountDifference(approved, cartTotal);

        difference.Should().Be(0m);
        BreakdownTotal(approved).Should().Be(PayPalCommerceServiceManager.ConvertMoney(approved));
    }

    /// <summary>
    /// Shopping-cart total the way <c>GetShoppingCartTotalAsync</c> builds it when
    /// <c>RoundPricesDuringCalculation</c> is on. Discounts and reward points are rounded as
    /// positive amounts and then subtracted. Gift-card remainder is not rounded until after
    /// it is subtracted. The value passed to <c>Round</c> is clamped to zero or more.
    /// </summary>
    private static decimal CartTotal(RoundingType roundingType, NegativeLine? negativeLine)
    {
        // GetUnitPriceAsync
        var lineTotal = RoundPrice(UnitPrice, roundingType) * Quantity;

        // GetShoppingCartSubTotalsAsync clamps, then rounds the subtotal.
        var subtotal = lineTotal < decimal.Zero ? decimal.Zero : lineTotal;
        subtotal = RoundPrice(subtotal, roundingType);

        if (negativeLine == NegativeLine.OrderSubtotalDiscount)
        {
            // GetOrderSubtotalDiscountAsync rejects a negative discount, then rounds it.
            var discount = RoundPrice(NegativeAmount, roundingType);
            if (subtotal < discount)
                discount = subtotal;

            subtotal -= discount;
            if (subtotal < decimal.Zero)
                subtotal = decimal.Zero;

            subtotal = RoundPrice(subtotal, roundingType);
        }

        // AdjustShippingRateAsync and GetTaxTotalAsync
        var result = subtotal + RoundPrice(Shipping, roundingType) + RoundPrice(Tax, roundingType);
        result = RoundPrice(result, roundingType);

        if (negativeLine == NegativeLine.GiftCard)
        {
            // AppliedGiftCardsAsync subtracts the remaining amount, which is not cash-rounded.
            var used = result > NegativeAmount ? NegativeAmount : result;
            result -= used;
            if (result < decimal.Zero)
                result = decimal.Zero;

            result = RoundPrice(result, roundingType);
        }

        if (negativeLine == NegativeLine.RewardPoints)
        {
            // ConvertRewardPointsToAmountAsync rounds the redeemed amount.
            // SetRewardPointsAsync never redeems more than the order total.
            var redeemed = RoundPrice(NegativeAmount, roundingType);
            if (result > redeemed)
                result -= redeemed;
            else
                result = decimal.Zero;

            result = RoundPrice(result, roundingType);
        }

        return result;
    }

    /// <summary>
    /// Approved PayPal amount the way <c>PrepareOrderMoneyAsync</c> builds it: two-decimal money,
    /// a discount residual, and an adjustment item when that residual would be negative.
    /// The order amount is <c>PrepareMoney</c> of the cart total.
    /// </summary>
    private static OrderMoney BuildApprovedOrderMoney(RoundingType roundingType, decimal cartTotal)
    {
        var items = new List<Item>
        {
            new()
            {
                Name = "Product",
                Quantity = Quantity.ToString(),
                UnitAmount = PayPalCommerceServiceManager.PrepareMoney(RoundPrice(UnitPrice, roundingType), CurrencyCode)
            }
        };

        const string adjustmentName = "Adjustment";
        const string adjustmentDescription = "Rounding adjustment";

        var orderTotal = PayPalCommerceServiceManager.PrepareMoney(cartTotal, CurrencyCode);
        var orderShippingTotal = PayPalCommerceServiceManager.PrepareMoney(RoundPrice(Shipping, roundingType), CurrencyCode);
        var orderTaxTotal = PayPalCommerceServiceManager.PrepareMoney(RoundPrice(Tax, roundingType), CurrencyCode);

        var itemAdjustment = decimal.Zero;
        var itemTotal = items.Sum(item => PayPalCommerceServiceManager.ConvertMoney(item.UnitAmount) * int.Parse(item.Quantity));
        var discountTotal = itemTotal
            + PayPalCommerceServiceManager.ConvertMoney(orderTaxTotal)
            + PayPalCommerceServiceManager.ConvertMoney(orderShippingTotal)
            - PayPalCommerceServiceManager.ConvertMoney(orderTotal);
        if (discountTotal < decimal.Zero)
        {
            itemAdjustment = -discountTotal;
            itemTotal += itemAdjustment;
            discountTotal = decimal.Zero;
        }

        if (itemAdjustment > decimal.Zero)
        {
            var unitAmount = PayPalCommerceServiceManager.PrepareMoney(itemAdjustment, CurrencyCode);
            if (PayPalCommerceServiceManager.ConvertMoney(unitAmount) > decimal.Zero)
            {
                items.Add(new()
                {
                    Name = adjustmentName,
                    Description = adjustmentDescription,
                    Quantity = 1.ToString(),
                    UnitAmount = unitAmount
                });
            }
        }

        return new()
        {
            CurrencyCode = CurrencyCode,
            Value = orderTotal.Value,
            Breakdown = new()
            {
                ItemTotal = PayPalCommerceServiceManager.PrepareMoney(itemTotal, CurrencyCode),
                TaxTotal = orderTaxTotal,
                Shipping = orderShippingTotal,
                Discount = PayPalCommerceServiceManager.PrepareMoney(discountTotal, CurrencyCode)
            }
        };
    }

    private static decimal BreakdownTotal(OrderMoney approved)
    {
        var breakdown = approved.Breakdown;
        return PayPalCommerceServiceManager.ConvertMoney(breakdown.ItemTotal)
            + PayPalCommerceServiceManager.ConvertMoney(breakdown.TaxTotal)
            + PayPalCommerceServiceManager.ConvertMoney(breakdown.Shipping)
            - PayPalCommerceServiceManager.ConvertMoney(breakdown.Discount);
    }

    private static decimal RoundPrice(decimal value, RoundingType roundingType)
    {
        return _priceCalculator.Round(value, roundingType);
    }
}
