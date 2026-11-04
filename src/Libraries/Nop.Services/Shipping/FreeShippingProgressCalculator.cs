namespace Nop.Services.Shipping;

/// <summary>
/// Remaining-amount math for the free-shipping progress bar.
/// The unlocked state is decided by <see cref="Nop.Services.Orders.OrderTotalCalculationService.IsFreeShippingAsync"/>,
/// which treats shipping as free only when the subtotal is greater than the threshold.
/// This type only answers how much is left and how full the bar should look.
/// </summary>
public static class FreeShippingProgressCalculator
{
    /// <summary>
    /// Amount still required to reach the free-shipping threshold.
    /// Returns zero when the subtotal is at or above the threshold, or when the threshold is not positive.
    /// </summary>
    /// <param name="subtotal">Cart subtotal on the same basis as the free-shipping rule (primary store currency).</param>
    /// <param name="threshold">Configured free-shipping-over-X value (primary store currency).</param>
    public static decimal GetRemainingAmount(decimal subtotal, decimal threshold)
    {
        if (threshold <= 0m)
            return 0m;

        var remaining = threshold - subtotal;
        return remaining > 0m ? remaining : 0m;
    }

    /// <summary>
    /// Fill percentage for the bar. 100 is reserved for a subtotal strictly above the threshold,
    /// matching the free-shipping rule, so an exact match does not look finished while shipping is still charged.
    /// </summary>
    public static int GetProgressPercent(decimal subtotal, decimal threshold)
    {
        if (threshold <= 0m)
            return subtotal > 0m ? 100 : 0;

        if (subtotal <= 0m)
            return 0;

        if (subtotal > threshold)
            return 100;

        var percent = (int)Math.Floor(subtotal / threshold * 100m);
        if (percent >= 100)
            return 99;
        if (percent < 0)
            return 0;

        return percent;
    }
}
