using Nop.Core.Domain.Orders;
using Nop.Services.Shipping;
using Nop.Web.Models.ShoppingCart;

namespace Nop.Web.Factories;

public partial class ShoppingCartModelFactory
{
    /// <summary>
    /// Prepare the free-shipping progress model for the cart and the header mini-cart.
    /// </summary>
    /// <param name="cart">Shopping cart</param>
    public virtual async Task<FreeShippingProgressModel> PrepareFreeShippingProgressModelAsync(IList<ShoppingCartItem> cart)
    {
        var model = new FreeShippingProgressModel();

        if (!_shippingSettings.FreeShippingOverXEnabled || cart == null || cart.Count == 0)
            return model;

        // Lines that already ship free do not count toward the threshold. Shipping totals still use the full cart.
        var qualifyingCart = new List<ShoppingCartItem>(cart.Count);
        foreach (var shoppingCartItem in cart)
        {
            if (!await _shippingService.IsFreeShippingAsync(shoppingCartItem))
                qualifyingCart.Add(shoppingCartItem);
        }

        if (qualifyingCart.Count == 0)
            return model;

        var includingTax = _shippingSettings.FreeShippingOverXIncludingTax;
        var (_, _, _, subTotalWithDiscount, _) = await _orderTotalCalculationService.GetShoppingCartSubTotalAsync(qualifyingCart, includingTax);
        var threshold = _shippingSettings.FreeShippingOverXValue;

        var unlocked = await _orderTotalCalculationService.IsFreeShippingAsync(qualifyingCart, subTotalWithDiscount);

        var currentCurrency = await _workContext.GetWorkingCurrencyAsync();
        var languageId = (await _workContext.GetWorkingLanguageAsync()).Id;

        var remainingPrimary = unlocked
            ? 0m
            : FreeShippingProgressCalculator.GetRemainingAmount(subTotalWithDiscount, threshold);
        if (!unlocked && remainingPrimary == 0m && threshold > 0m && subTotalWithDiscount <= threshold)
            remainingPrimary = 0.01m;

        var remainingCustomer = await _currencyService.ConvertFromPrimaryStoreCurrencyAsync(remainingPrimary, currentCurrency);
        var subtotalCustomer = await _currencyService.ConvertFromPrimaryStoreCurrencyAsync(subTotalWithDiscount, currentCurrency);
        var thresholdCustomer = await _currencyService.ConvertFromPrimaryStoreCurrencyAsync(threshold, currentCurrency);

        model.Visible = true;
        model.Unlocked = unlocked;
        model.RemainingAmount = remainingCustomer;
        model.ProgressPercent = unlocked
            ? 100
            : FreeShippingProgressCalculator.GetProgressPercent(subTotalWithDiscount, threshold);

        if (unlocked)
        {
            model.Message = await _localizationService.GetResourceAsync("ShoppingCart.FreeShippingProgress.Reached");
        }
        else
        {
            var formattedRemaining = await _priceFormatter.FormatPriceAsync(remainingCustomer, true, currentCurrency, languageId, includingTax, false);
            var template = await _localizationService.GetResourceAsync("ShoppingCart.FreeShippingProgress.Remaining");
            model.Message = string.Format(template, formattedRemaining);
        }

        var formattedSubtotal = await _priceFormatter.FormatPriceAsync(subtotalCustomer, true, currentCurrency, languageId, includingTax, false);
        var formattedThreshold = await _priceFormatter.FormatPriceAsync(thresholdCustomer, true, currentCurrency, languageId, includingTax, false);
        var captionTemplate = await _localizationService.GetResourceAsync("ShoppingCart.FreeShippingProgress.Caption");
        model.Caption = string.Format(captionTemplate, formattedSubtotal, formattedThreshold);
        model.AriaValueText = unlocked
            ? model.Message
            : string.Format(await _localizationService.GetResourceAsync("ShoppingCart.FreeShippingProgress.Caption"), formattedSubtotal, formattedThreshold);

        return model;
    }
}
