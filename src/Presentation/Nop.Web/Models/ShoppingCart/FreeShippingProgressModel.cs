using Nop.Web.Framework.Models;

namespace Nop.Web.Models.ShoppingCart;

public partial record FreeShippingProgressModel : BaseNopModel
{
    public bool Visible { get; set; }

    public bool Unlocked { get; set; }

    public string Message { get; set; }

    /// <summary>
    /// Amount still needed, in the customer's working currency. Zero when unlocked.
    /// </summary>
    public decimal RemainingAmount { get; set; }

    public int ProgressPercent { get; set; }
}
