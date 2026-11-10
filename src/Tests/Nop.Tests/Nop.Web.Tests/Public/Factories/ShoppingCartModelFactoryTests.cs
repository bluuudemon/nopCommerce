using AwesomeAssertions;
using Nop.Core;
using Nop.Core.Domain.Orders;
using Nop.Core.Domain.Shipping;
using Nop.Data;
using Nop.Services.Catalog;
using Nop.Services.Configuration;
using Nop.Services.Customers;
using Nop.Services.Localization;
using Nop.Services.Orders;
using Nop.Web.Factories;
using Nop.Web.Models.ShoppingCart;
using NUnit.Framework;

namespace Nop.Tests.Nop.Web.Tests.Public.Factories;

[TestFixture]
public class ShoppingCartModelFactoryTests : WebTest
{
    private IShoppingCartModelFactory _shoppingCartModelFactory;
    private IShoppingCartService _shoppingCartService;
    private IWorkContext _workContext;
    private IProductService _producService;
    private ILocalizationService _localizationService;
    private ShoppingCartItem _shoppingCartItem;
    private ShoppingCartItem _wishlistItem;
    private ICustomerService _customerService;

    [OneTimeSetUp]
    public async Task SetUp()
    {
        _shoppingCartModelFactory = GetService<IShoppingCartModelFactory>();
        _shoppingCartService = GetService<IShoppingCartService>();
        _workContext = GetService<IWorkContext>();
        _producService = GetService<IProductService>();
        _localizationService = GetService<ILocalizationService>();
        _customerService = GetService<ICustomerService>();

        var store = await GetService<IStoreContext>().GetCurrentStoreAsync();

        var customer = await _workContext.GetCurrentCustomerAsync();

        _shoppingCartItem = new ShoppingCartItem
        {
            ProductId = 1,
            Quantity = 1,
            CustomerId = customer.Id,
            ShoppingCartType = ShoppingCartType.ShoppingCart,
            StoreId = store.Id
        };

        _wishlistItem = new ShoppingCartItem
        {
            ProductId = 2,
            Quantity = 1,
            CustomerId = customer.Id,
            ShoppingCartType = ShoppingCartType.Wishlist
        };

        var shoppingCartRepo = GetService<IRepository<ShoppingCartItem>>();

        await shoppingCartRepo.InsertAsync(new List<ShoppingCartItem> { _shoppingCartItem, _wishlistItem });

        customer.HasShoppingCartItems = true;
        await _customerService.UpdateCustomerAsync(customer);
    }

    [OneTimeTearDown]
    public async Task TearDown()
    {
        await _shoppingCartService.DeleteShoppingCartItemAsync(_shoppingCartItem);
        await _shoppingCartService.DeleteShoppingCartItemAsync(_wishlistItem);

        var customer = await _workContext.GetCurrentCustomerAsync();
        customer.HasShoppingCartItems = false;
        await _customerService.UpdateCustomerAsync(customer);
    }

    [Test]
    public async Task CanPrepareEstimateShippingModel()
    {
        var model = await _shoppingCartModelFactory.PrepareEstimateShippingModelAsync(await _shoppingCartService.GetShoppingCartAsync(await _workContext.GetCurrentCustomerAsync()));

        model.AvailableCountries.Any().Should().BeTrue();
        model.AvailableStates.Any().Should().BeTrue();
        model.Enabled.Should().BeTrue();
        model.ZipPostalCode.Should().Be("10021");
        model.CountryId.Should().BeNull();
        model.StateProvinceId.Should().BeNull();
    }

    [Test]
    public async Task CanPrepareShoppingCartModel()
    {
        var model = await _shoppingCartModelFactory.PrepareShoppingCartModelAsync(new ShoppingCartModel(),
            new List<ShoppingCartItem> { _shoppingCartItem });

        model.IsEditable.Should().BeTrue();
        model.Items.Any().Should().BeTrue();
        model.Items.Count.Should().Be(1);
        model.Warnings.Count.Should().Be(0);

        model.OrderReviewData.Should().NotBeNull();
        model.OrderReviewData.Display.Should().BeFalse();
        model = await _shoppingCartModelFactory.PrepareShoppingCartModelAsync(new ShoppingCartModel(),
            new List<ShoppingCartItem> { _shoppingCartItem }, true, true, true);
        model.OrderReviewData.Should().NotBeNull();
        model.OrderReviewData.Display.Should().BeTrue();
    }

    [Test]
    public async Task CanPrepareWishlistModel()
    {
        var model = await _shoppingCartModelFactory.PrepareWishlistModelAsync(new WishlistModel(),
            new List<ShoppingCartItem> { _wishlistItem });

        var customer = await _workContext.GetCurrentCustomerAsync();

        model.CustomerFullname.Should().Be("John Smith");
        model.CustomerGuid.Should().Be(customer.CustomerGuid);
        model.EmailWishlistEnabled.Should().BeTrue();
        model.IsEditable.Should().BeTrue();
        model.Items.Any().Should().BeTrue();
        model.Items.Count.Should().Be(1);
        model.Warnings.Count.Should().Be(0);
    }

    [Test]
    public async Task CanPrepareMiniShoppingCartModel()
    {
        var model = await _shoppingCartModelFactory.PrepareMiniShoppingCartModelAsync();

        model.CurrentCustomerIsGuest.Should().BeFalse();
        model.Items.Any().Should().BeTrue();
        model.Items.Count.Should().Be(1);
        model.TotalProducts.Should().Be(1);
        model.SubTotal.Should().Be("$1,200.00");
    }

    [Test]
    public async Task CanPrepareOrderTotalsModel()
    {
        var model = await _shoppingCartModelFactory.PrepareOrderTotalsModelAsync(new List<ShoppingCartItem> { _shoppingCartItem }, true);

        model.SubTotal.Should().Be("$1,200.00");
        model.OrderTotal.Should().Be("$1,200.00");

        model.GiftCards.Any().Should().BeFalse();
        model.Shipping.Should().Be("$0.00");
        model.Tax.Should().Be("$0.00");
        model.WillEarnRewardPoints.Should().Be(120);
    }

    [Test]
    public async Task CanPrepareEstimateShippingResultModel()
    {
        var model = await _shoppingCartModelFactory.PrepareEstimateShippingResultModelAsync(new List<ShoppingCartItem> { _shoppingCartItem }, new EstimateShippingModel(), true);
        model.Errors.Any().Should().BeFalse();
    }

    [Test]
    public async Task CanPrepareWishlistEmailAFriendModel()
    {
        var model = await _shoppingCartModelFactory.PrepareWishlistEmailAFriendModelAsync(new WishlistEmailAFriendModel(),
            false);

        model.YourEmailAddress.Should().Be(NopTestsDefaults.AdminEmail);
    }

    [Test]
    public async Task FreeShippingProgress_BelowAtAbove_SettingOff_EmptyCart()
    {
        var shippingSettings = GetService<ShippingSettings>();
        var settingService = GetService<ISettingService>();
        var orderTotalCalculationService = GetService<IOrderTotalCalculationService>();
        var enabled = shippingSettings.FreeShippingOverXEnabled;
        var threshold = shippingSettings.FreeShippingOverXValue;
        var includingTax = shippingSettings.FreeShippingOverXIncludingTax;

        var product = await _producService.GetProductBySkuAsync("FR_451_RB");
        var wasFreeShipping = product.IsFreeShipping;
        product.IsFreeShipping = false;
        await _producService.UpdateProductAsync(product);

        try
        {
            var customer = await _workContext.GetCurrentCustomerAsync();
            (await _customerService.GetCustomerRolesAsync(customer)).Any(role => role.FreeShipping).Should().BeFalse();

            var store = await GetService<IStoreContext>().GetCurrentStoreAsync();
            var cart = new List<ShoppingCartItem>
            {
                new()
                {
                    ProductId = product.Id,
                    Quantity = 1,
                    CustomerId = customer.Id,
                    ShoppingCartType = ShoppingCartType.ShoppingCart,
                    StoreId = store.Id,
                    AttributesXml = string.Empty
                }
            };

            shippingSettings.FreeShippingOverXEnabled = true;
            shippingSettings.FreeShippingOverXIncludingTax = false;
            var (_, _, _, subtotal, _) = await orderTotalCalculationService.GetShoppingCartSubTotalAsync(cart, false);
            subtotal.Should().BeGreaterThan(0);

            // The test host registers ISettings as transient and loads a new object on every resolve.
            // The factory keeps the instance injected when it was constructed, so an in-memory edit of
            // another ShippingSettings is invisible until it is saved and the factory is resolved again.
            async Task<(FreeShippingProgressModel model, bool isFreeShipping)> ReadProgressAsync()
            {
                await settingService.SaveSettingAsync(shippingSettings);
                var progress = await GetService<IShoppingCartModelFactory>().PrepareFreeShippingProgressModelAsync(cart);
                var isFreeShipping = await GetService<IOrderTotalCalculationService>().IsFreeShippingAsync(cart);
                return (progress, isFreeShipping);
            }

            shippingSettings.FreeShippingOverXValue = subtotal + 10m;
            var (below, belowIsFree) = await ReadProgressAsync();
            below.Show.Should().BeTrue();
            below.IsQualified.Should().BeFalse();
            below.RemainingPrimary.Should().Be(10m);
            below.Message.Should().Contain("free shipping");
            below.Caption.Should().NotBeNullOrEmpty();
            belowIsFree.Should().BeFalse();

            shippingSettings.FreeShippingOverXValue = subtotal;
            var (at, atIsFree) = await ReadProgressAsync();
            at.Show.Should().BeTrue();
            at.IsQualified.Should().BeFalse();
            at.RemainingPrimary.Should().Be(0m);
            at.ProgressPercent.Should().Be(100m);
            atIsFree.Should().BeFalse();

            shippingSettings.FreeShippingOverXValue = subtotal - 0.01m;
            var (above, aboveIsFree) = await ReadProgressAsync();
            above.Show.Should().BeTrue();
            above.IsQualified.Should().BeTrue();
            above.RemainingPrimary.Should().Be(0m);
            above.ProgressPercent.Should().Be(100m);
            above.Message.Should().Be("You've unlocked free shipping!");
            aboveIsFree.Should().BeTrue();

            shippingSettings.FreeShippingOverXEnabled = false;
            var (hidden, _) = await ReadProgressAsync();
            hidden.Show.Should().BeFalse();

            shippingSettings.FreeShippingOverXEnabled = true;
            await settingService.SaveSettingAsync(shippingSettings);
            var empty = await GetService<IShoppingCartModelFactory>().PrepareFreeShippingProgressModelAsync(new List<ShoppingCartItem>());
            empty.Show.Should().BeFalse();
        }
        finally
        {
            product.IsFreeShipping = wasFreeShipping;
            await _producService.UpdateProductAsync(product);

            shippingSettings.FreeShippingOverXEnabled = enabled;
            shippingSettings.FreeShippingOverXValue = threshold;
            shippingSettings.FreeShippingOverXIncludingTax = includingTax;
            await settingService.SaveSettingAsync(shippingSettings);
        }
    }

    [Test]
    public async Task CanPrepareCartItemPictureModel()
    {
        var product = await _producService.GetProductByIdAsync(_shoppingCartItem.ProductId);

        var model = await _shoppingCartModelFactory.PrepareCartItemPictureModelAsync(_shoppingCartItem, 100, true, await _localizationService.GetLocalizedAsync(product, x => x.Name));

        model.AlternateText.Should().Be("Picture of Build your own computer");
        model.ImageUrl.Should()
            .Be($"http://{NopTestsDefaults.HostIpAddress}/images/thumbs/0000020_build-your-own-computer_100.jpeg");
        model.Title.Should().Be("Show details for Build your own computer");

        model.FullSizeImageUrl.Should().Be($"http://{NopTestsDefaults.HostIpAddress}/images/thumbs/0000020_build-your-own-computer.jpeg");
        model.ThumbImageUrl.Should().BeNull();
    }
}