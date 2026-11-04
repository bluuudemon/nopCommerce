using Nop.Core.Domain.Orders;
using Nop.Services.Shipping;
using Nop.Web.Models.ShoppingCart;

namespace Nop.Web.Factories;

public partial class ShoppingCartModelFactory
{
    /// <summary>
    /// Prepare the free-shipping progress model for the cart and the header mini-cart.
    /// Hidden when free-shipping-over-X is disabled or the cart is empty.
    /// The subtotal and the unlocked flag use <see cref="Nop.Services.Orders.IOrderTotalCalculationService.IsFreeShippingAsync"/>
    /// so the bar and the shipping charge stay in agreement.
    /// </summary>
    /// <param name="cart">Shopping cart</param>
    public virtual async Task<FreeShippingProgressModel> PrepareFreeShippingProgressModelAsync(IList<ShoppingCartItem> cart)
    {
        var model = new FreeShippingProgressModel();

        if (!_shippingSettings.FreeShippingOverXEnabled || cart == null || cart.Count == 0)
            return model;

        var includingTax = _shippingSettings.FreeShippingOverXIncludingTax;
        var (_, _, _, subTotalWithDiscount, _) = await _orderTotalCalculationService.GetShoppingCartSubTotalAsync(cart, includingTax);
        var threshold = _shippingSettings.FreeShippingOverXValue;

        // Pass the subtotal so the threshold check uses the same incl/excl-tax, after-discount basis.
        var unlocked = await _orderTotalCalculationService.IsFreeShippingAsync(cart, subTotalWithDiscount);

        var currentCurrency = await _workContext.GetWorkingCurrencyAsync();
        var languageId = (await _workContext.GetWorkingLanguageAsync()).Id;
        var remainingPrimary = unlocked
            ? 0m
            : FreeShippingProgressCalculator.GetRemainingAmount(subTotalWithDiscount, threshold);
        var remainingCustomer = await _currencyService.ConvertFromPrimaryStoreCurrencyAsync(remainingPrimary, currentCurrency);

        model.Visible = true;
        model.Unlocked = unlocked;
        model.RemainingAmount = remainingCustomer;
        model.ProgressPercent = unlocked
            ? 100
            : FreeShippingProgressCalculator.GetProgressPercent(subTotalWithDiscount, threshold);

        if (unlocked)
        {
            model.Message = await _localizationService.GetResourceAsync("ShoppingCart.FreeShipping.Unlocked");
        }
        else
        {
            var formattedRemaining = await _priceFormatter.FormatPriceAsync(remainingCustomer, true, currentCurrency, languageId, includingTax, false);
            var template = await _localizationService.GetResourceAsync("ShoppingCart.FreeShipping.Remaining");
            model.Message = string.Format(template, formattedRemaining);
        }

        return model;
    }
}
