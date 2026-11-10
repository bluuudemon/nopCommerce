using AwesomeAssertions;
using Nop.Core;
using Nop.Core.Domain.Orders;
using Nop.Core.Domain.Shipping;
using Nop.Services.Catalog;
using Nop.Services.Configuration;
using Nop.Web.Factories;
using NUnit.Framework;

namespace Nop.Tests.Nop.Web.Tests.Public.Factories;

[TestFixture]
public class FreeShippingProgressModelFactoryTests : WebTest
{
    [Test]
    public async Task MixedCartExcludesFreeShippingLinesFromTheProgressSubtotal()
    {
        var settingService = GetService<ISettingService>();
        var shippingSettings = GetService<ShippingSettings>();
        var freeShippingWasEnabled = shippingSettings.FreeShippingOverXEnabled;
        var freeShippingThreshold = shippingSettings.FreeShippingOverXValue;
        var freeShippingIncludedTax = shippingSettings.FreeShippingOverXIncludingTax;

        try
        {
            shippingSettings.FreeShippingOverXEnabled = true;
            shippingSettings.FreeShippingOverXValue = 75m;
            shippingSettings.FreeShippingOverXIncludingTax = false;
            await settingService.SaveSettingAsync(shippingSettings);

            var productService = GetService<IProductService>();
            var freeShippingProduct = await productService.GetProductBySkuAsync("BP_20_WSP");
            var standardProduct = await productService.GetProductBySkuAsync("NK_FRC_RS");
            freeShippingProduct.Should().NotBeNull();
            standardProduct.Should().NotBeNull();
            freeShippingProduct.IsFreeShipping.Should().BeTrue();
            standardProduct.IsFreeShipping.Should().BeFalse();

            var customer = await GetService<IWorkContext>().GetCurrentCustomerAsync();
            var store = await GetService<IStoreContext>().GetCurrentStoreAsync();
            var cart = new List<ShoppingCartItem>
            {
                new()
                {
                    ProductId = freeShippingProduct.Id,
                    Quantity = 1,
                    CustomerId = customer.Id,
                    StoreId = store.Id,
                    ShoppingCartType = ShoppingCartType.ShoppingCart
                },
                new()
                {
                    ProductId = standardProduct.Id,
                    Quantity = 1,
                    CustomerId = customer.Id,
                    StoreId = store.Id,
                    ShoppingCartType = ShoppingCartType.ShoppingCart
                }
            };

            var model = await GetService<IShoppingCartModelFactory>().PrepareFreeShippingProgressModelAsync(cart);

            model.Visible.Should().BeTrue();
            model.Unlocked.Should().BeFalse();
            model.RemainingAmount.Should().Be(35m);
            model.ProgressPercent.Should().Be(53);
            model.Message.Should().Be("Add $35.00 more for free shipping");
            model.Caption.Should().Be("$40.00 of $75.00");
        }
        finally
        {
            shippingSettings.FreeShippingOverXEnabled = freeShippingWasEnabled;
            shippingSettings.FreeShippingOverXValue = freeShippingThreshold;
            shippingSettings.FreeShippingOverXIncludingTax = freeShippingIncludedTax;
            await settingService.SaveSettingAsync(shippingSettings);
        }
    }
}
