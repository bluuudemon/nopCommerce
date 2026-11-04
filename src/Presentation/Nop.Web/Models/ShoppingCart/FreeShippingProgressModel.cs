using Nop.Web.Framework.Models;

namespace Nop.Web.Models.ShoppingCart;

/// <summary>
/// Progress toward the existing free-shipping-over-X threshold.
/// </summary>
public partial record FreeShippingProgressModel : BaseNopModel
{
    public bool Show { get; set; }

    public bool IsQualified { get; set; }

    /// <summary>
    /// card-mobile, card-desktop, or flyout.
    /// </summary>
    public string Variant { get; set; }

    public string Message { get; set; }

    public string Hint { get; set; }

    public string Caption { get; set; }

    /// <summary>
    /// Fill percentage from 0 to 100.
    /// </summary>
    public decimal ProgressPercent { get; set; }

    /// <summary>
    /// Shopper-currency subtotal shown on the bar.
    /// </summary>
    public decimal SubtotalValue { get; set; }

    /// <summary>
    /// Shopper-currency threshold.
    /// </summary>
    public decimal ThresholdValue { get; set; }

    /// <summary>
    /// Shopper-currency amount still required. Zero when nothing remains.
    /// </summary>
    public decimal RemainingValue { get; set; }

    /// <summary>
    /// aria-valuenow. The threshold once shipping is unlocked, otherwise the subtotal clamped to the threshold.
    /// </summary>
    public decimal ProgressValue { get; set; }

    /// <summary>
    /// Primary-store-currency subtotal used for the free-shipping rule.
    /// </summary>
    public decimal SubtotalPrimary { get; set; }

    public decimal ThresholdPrimary { get; set; }

    public decimal RemainingPrimary { get; set; }
}
