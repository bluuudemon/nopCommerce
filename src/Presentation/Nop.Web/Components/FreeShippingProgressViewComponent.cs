using Microsoft.AspNetCore.Mvc;
using Nop.Core;
using Nop.Core.Domain.Orders;
using Nop.Services.Orders;
using Nop.Web.Factories;
using Nop.Web.Framework.Components;

namespace Nop.Web.Components;

public partial class FreeShippingProgressViewComponent : NopViewComponent
{
    protected readonly IShoppingCartModelFactory _shoppingCartModelFactory;
    protected readonly IShoppingCartService _shoppingCartService;
    protected readonly IStoreContext _storeContext;
    protected readonly IWorkContext _workContext;

    public FreeShippingProgressViewComponent(IShoppingCartModelFactory shoppingCartModelFactory,
        IShoppingCartService shoppingCartService,
        IStoreContext storeContext,
        IWorkContext workContext)
    {
        _shoppingCartModelFactory = shoppingCartModelFactory;
        _shoppingCartService = shoppingCartService;
        _storeContext = storeContext;
        _workContext = workContext;
    }

    /// <summary>
    /// Renders the free-shipping progress bar.
    /// </summary>
    /// <param name="variant">card-mobile, card-desktop, or flyout.</param>
    public async Task<IViewComponentResult> InvokeAsync(string variant = "card-desktop")
    {
        var store = await _storeContext.GetCurrentStoreAsync();
        var cart = await _shoppingCartService.GetShoppingCartAsync(await _workContext.GetCurrentCustomerAsync(), ShoppingCartType.ShoppingCart, store.Id);
        var model = await _shoppingCartModelFactory.PrepareFreeShippingProgressModelAsync(cart);
        if (!model.Show)
            return Content(string.Empty);

        model.Variant = string.IsNullOrEmpty(variant) ? "card-desktop" : variant;
        return await ViewAsync(model);
    }
}
