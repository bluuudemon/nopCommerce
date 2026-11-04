# Feature shortlist

Candidates for the Feature-to-Ship demo. Each one is visible on the public storefront, small enough for one coding-agent session, and easy to point at afterwards. This branch implements the free-shipping progress bar. The other candidates are not built.

The storefront that matters is the default theme: product details, category grids, the cart, the header mini-cart. Admin screens are out of scope except where a single existing setting turns the feature on.

## Recommendation

**Build the free-shipping progress bar.** It is the hero.

A shopper sees a bar in the cart and in the header mini-cart: "Add $35.00 more for free shipping," filling as the subtotal climbs, then "You've unlocked free shipping." The presenter can show the same cart before and after on two ports. The calculation already exists. The demo only adds the bar.

**Runner-up: the low-stock urgency badge.** Same session size, very visible on the product page and category tiles, slightly worse as a cold demo because every sample product is stocked at 10,000.

## What is already there

Do not rebuild these. They make weak "new feature" demos.

| Idea | What the code already does |
| --- | --- |
| Recently viewed | Cookie list in `RecentlyViewedProductsService`, a sidebar block on two-column pages (`_ColumnsTwo.cshtml` → `RecentlyViewedProductsBlock`), and a full page. Empty on the first visit, so a cold open shows nothing. |
| Related products | Grid at the bottom of the product page (`RelatedProductsViewComponent`). Curated in admin, not a new interaction. |
| Also purchased | `ProductsAlsoPurchasedViewComponent` on the product page. It only fills after real orders, so a fresh sample store renders nothing. |
| Free shipping over $X | Setting and math only. `ShippingSettings.FreeShippingOverXEnabled` / `FreeShippingOverXValue` are applied in `OrderTotalCalculationService.IsFreeShippingAsync`. No progress UI. |
| Stock text | `ProductService.FormatStockMessageAsync` prints "In stock" in `_Availability.cshtml`. Category tiles (`_ProductBox.cshtml`) show no stock at all. |
| Mini-cart | Header flyout (`FlyoutShoppingCart/Default.cshtml`) lists items and a subtotal. No incentive message. |

Sample-data traps, verified in `App_Data/Installation/SampleData.json`:

- Almost every product has `StockQuantity` 10000. A low-stock badge is invisible until one product is edited.
- A few products are `IsFreeShipping: true` (Build your own computer, Apple MacBook Pro, and a handful of others). The free-shipping rule short-circuits when every line is already free. Demo the bar with a normal product such as Nike Floral Roshe Customized Running Shoes ($40) or a phone, not the computer.

## Ranked candidates

### 1. Free-shipping progress bar — hero

**What the shopper sees.** On the cart, above the totals, and inside the header mini-cart: a labeled bar and the dollars left. At the threshold it switches to a completed state. Updating quantity moves the bar without a full page mystery.

**Why it is the demo.** It shows up in two places the presenter already opens (cart and header). Before is a plain totals table. After is an obvious bar. One admin switch turns it on: Configuration → Settings → Shipping → Free shipping over X. Set the value around $75 so one $40 shoe is partial and two unlock it.

**Code it touches.**

- Read `ShippingSettings` and the same subtotal `IsFreeShippingAsync` already uses (`OrderTotalCalculationService`, including the incl/excl tax flag). Do not change that method.
- New view component, for example `FreeShippingProgress`, fed by `ShoppingCartModelFactory` (cart subtotal and `MiniShoppingCartModel.SubTotalValue` already exist).
- Render it from `Views/Shared/Components/OrderSummary/Default.cshtml` (cart footer, near `OrderTotals`) and `Views/Shared/Components/FlyoutShoppingCart/Default.cshtml`.
- A short block in `Themes/DefaultClean/Content/css/styles.css` and a couple of locale strings.

**Size.** Small. A component, two view insertions, CSS, strings. No checkout or shipping-rate change.

**Risk.** Low, if the bar uses the same subtotal basis as `IsFreeShippingAsync`. The failure mode to avoid is a bar that says "unlocked" while the order total still charges shipping, or the reverse. Products already marked free-shipping will complete the bar immediately; call that out in the demo script.

**How we measure it.** The admin toggle is the on/off flag. Count carts that cross the threshold, cart-to-checkout rate, and average subtotal for sessions that rendered the bar (`data-free-shipping-progress` on the element is enough for a tag). A click on the bar is optional; the conversion-ish metric is threshold reached → checkout.

### 2. Low-stock urgency badge — runner-up

**What the shopper sees.** A badge on the product page next to availability, and on each category tile: "Only 3 left" when stock is above zero and at or below a threshold (the product's `MinStockQuantity`, or one catalog setting such as 5). Out of stock stays the existing message.

**Why it is second.** It is the product-page and category-page moment, which the progress bar does not cover. It is still one session. It is a worse live demo on a fresh database because sample stock is 10,000, so the greenlight step has to drop one product (Apple iPhone 16, Nike shoes) to 3 in admin before the audience sees it.

**Code it touches.**

- `Product.StockQuantity`, `MinStockQuantity`, `DisplayStockAvailability`, `DisplayStockQuantity`, `LowStockActivity` already exist. `FormatStockMessageAsync` in `ProductService` is the stock string.
- `Views/Product/_Availability.cshtml` for the product page.
- `ProductOverviewModel` plus `ProductModelFactory.PrepareProductOverviewModelsAsync`, then `Views/Shared/_ProductBox.cshtml`, so category and search tiles get the badge. Stock is already on the `Product` row, so this should not add a query per tile.
- CSS in the default theme. Respect `DisplayStockQuantity`: if the merchant hid the count, do not print a number.

**Size.** Small. Model field, factory, two views, CSS, one setting.

**Risk.** Low. The catalog grid is a hot path; keep the badge on data already loaded for the product. Do not badge products that do not manage stock.

**How we measure it.** Badge impression vs add-to-cart on badged products, compared with the same products before the badge. The threshold setting is the experiment flag. The badge element id (`data-low-stock`) is the countable hook.

### 3. Sticky add-to-cart bar

**What the shopper sees.** When the main add-to-cart button scrolls off screen, a bar pins to the bottom (or the top on desktop) with the product name, price, quantity, and Add to cart.

**Code it touches.** `Views/Product/ProductTemplate.Simple.cshtml`, `ProductTemplate.Grouped.cshtml`, `Views/Product/_AddToCart.cshtml` (the real button is `#add-to-cart-button-{id}` and posts `#product-details-form` through `AjaxCart.addproducttocart_details`), plus theme CSS and a small script.

**Size.** Small to medium. Mostly front end.

**Risk.** Medium. "Build your own computer" has required attributes. A bar that submits without those attributes fails or adds the wrong variant. Grouped products have the same edge. The bar has to submit the existing product form, not a second naive add.

**How we measure it.** Give the sticky button its own id and count its clicks against the in-page button, plus add-to-cart rate on long product pages.

**Why it is not the hero.** The before/after is invisible until someone scrolls, and the attribute edge is where a one-session build goes wrong on camera.

### 4. Quick view on category tiles

**What the shopper sees.** A Quick view control on each tile in a category grid. It opens a modal with image, price, short description, and add to cart, without leaving the grid.

**Code it touches.** `Views/Shared/_ProductBox.cshtml` and `Views/Catalog/_ProductsInGridOrLines.cshtml`. A new partial action that reuses product-details markup (`ProductModelFactory.PrepareProductDetailsModelAsync` is the heavy one). The store already has `displayPopupContentFromUrl` and `AjaxCart` in `wwwroot/js/public.ajaxcart.js`.

**Size.** Medium. New endpoint, modal markup, JS, and the add-to-cart form inside the modal.

**Risk.** Medium. Attribute, rental, and gift-card products need the same form as the product page. A modal that only works for simple products will break on the computer and the Nike shoes (size is required).

**How we measure it.** Quick-view opens, add-to-cart from the modal, and category-to-product-page exits. Very countable, more surface than the demo needs.

### 5. Frequently bought together

**What the shopper sees.** On the product page, a strip of two or three products with checkboxes, a combined price, and one Add selected to cart.

**Code it touches.** `ProductsAlsoPurchasedViewComponent` and `IOrderReportService.GetAlsoPurchasedProductsIdsAsync` for the data, `RelatedProductsViewComponent` as the fallback when there are no orders, `Views/Product/ProductTemplate.Simple.cshtml`, and a cart action that adds several products (`ShoppingCartController` already adds one).

**Size.** Medium. Combined price, multi-add, empty state.

**Risk.** Medium. A fresh sample store has no "also purchased" rows, so the strip is empty unless it falls back to related products. That fallback is a different feature wearing the same heading, which is a messy thing to explain live.

**How we measure it.** Bundle add-to-cart clicks and attach rate. Good metric, unreliable fixture.

## Demo script for the hero

1. Open baseline and feature on two ports (see `docs/demo/RUNBOOK.md`).
2. On the feature store, turn on Free shipping over X and set $75.
3. Add Nike Floral Roshe Customized Running Shoes once. The bar is partial.
4. Increase quantity or add another paid product. The bar completes and shipping drops off.
5. Hover the header cart. The same bar is in the mini-cart.
6. On baseline, the same cart has totals and no bar.
