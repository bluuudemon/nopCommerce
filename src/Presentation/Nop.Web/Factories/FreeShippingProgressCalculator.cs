namespace Nop.Web.Factories;

/// <summary>
/// Remaining amount until free shipping over X.
/// Qualification matches <c>OrderTotalCalculationService.IsFreeShippingAsync</c>:
/// the subtotal must be strictly greater than the threshold ("over X"), unless shipping is already free for another reason.
/// </summary>
public static class FreeShippingProgressCalculator
{
    public readonly record struct Result(bool Show, bool IsQualified, decimal Remaining, decimal ProgressRatio)
    {
        public static Result Hidden => new(false, false, 0m, 0m);
    }

    /// <summary>
    /// Calculates whether the bar is shown, whether shipping is unlocked, the amount still required, and the fill ratio.
    /// </summary>
    /// <param name="enabled">Free shipping over X is enabled.</param>
    /// <param name="threshold">Threshold in the same currency as <paramref name="subtotal"/>.</param>
    /// <param name="subtotal">Discounted subtotal using the same tax basis as the free-shipping rule.</param>
    /// <param name="hasItems">The cart has at least one item.</param>
    /// <param name="shippingAlreadyFree">Shipping is already free because of the customer role or because every item ships free.</param>
    public static Result Calculate(bool enabled, decimal threshold, decimal subtotal, bool hasItems, bool shippingAlreadyFree)
    {
        if (!enabled || !hasItems || threshold <= 0m)
            return Result.Hidden;

        // The store unlocks free shipping only when the subtotal is greater than X.
        // At the exact threshold the bar is full and nothing remains, but shipping is not free yet.
        var qualified = shippingAlreadyFree || subtotal > threshold;
        var remaining = !qualified && subtotal < threshold ? threshold - subtotal : 0m;

        var ratio = subtotal <= 0m ? 0m : subtotal / threshold;
        if (ratio < 0m)
            ratio = 0m;
        if (qualified || ratio > 1m)
            ratio = 1m;

        return new Result(true, qualified, remaining, ratio);
    }
}
