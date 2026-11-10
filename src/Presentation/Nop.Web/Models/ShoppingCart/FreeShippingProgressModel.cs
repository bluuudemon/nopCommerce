using Nop.Web.Framework.Models;

namespace Nop.Web.Models.ShoppingCart;

public partial record FreeShippingProgressModel : BaseNopModel
{
    public bool Visible { get; set; }

    public bool Unlocked { get; set; }

    public bool Compact { get; set; }

    public bool ShowCaption => !Compact;

    public string Message { get; set; }

    public string Caption { get; set; }

    public string AriaValueText { get; set; }

    /// <summary>
    /// Amount still needed, in the customer's working currency. Zero when unlocked.
    /// </summary>
    public decimal RemainingAmount { get; set; }

    public int ProgressPercent { get; set; }
}
