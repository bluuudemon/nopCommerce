# Bugbot review rules — nopCommerce (money paths)

This is an e-commerce platform. Treat any change to prices, totals, tax, discounts, gift cards,
reward points, refunds, or payment plugins as high risk. Prefer a false positive over a missed money bug.

## Scope that is "money path"
- src/Libraries/Nop.Services/Catalog/ (especially PriceCalculationService.cs, PriceFormatter.cs)
- src/Libraries/Nop.Services/Orders/ (OrderTotalCalculationService.cs, OrderProcessingService.cs)
- src/Libraries/Nop.Services/Tax/, src/Libraries/Nop.Services/Payments/, src/Libraries/Nop.Services/Discounts/
- src/Libraries/Nop.Core/Domain/Directory/RoundingType.cs
- src/Plugins/Nop.Plugin.Payments.*/ and src/Plugins/Nop.Plugin.Tax.*/

## Rules
1. **No float or double for money.** Any `float`, `double`, `Math.Round(double…)`, or `Convert.ToDouble`
   on a price, total, tax, discount, fee, or amount is a bug. Use `decimal`.
2. **Rounding must be symmetric for negatives.** Discounts, gift cards, reward points, and refunds are negative.
   Any rounding helper must satisfy `Round(-x, t) == -Round(x, t)` for every `RoundingType`. Flag code that uses
   `Math.Truncate`, `% `, or fraction-part arithmetic without handling the sign. Reference: upstream
   nopSolutions/nopCommerce#8424.
3. **Do not change positive-value rounding results** in PriceCalculationService.Round without an explicit
   note in the PR body and matching test changes.
4. **Exact equality on amounts across a provider boundary** (payment plugins comparing an approved/captured/
   refunded amount to a locally computed total) must be flagged for review: check that both sides are rounded
   the same way, to the same precision, in the same currency. Do NOT suggest adding a tolerance to the PayPal
   Commerce "totals must match" check in PayPalCommerceServiceManager.PlaceOrderAsync; it is a fraud guard.
   Flag any PR that weakens or removes it.
5. **Parsing money:** `decimal.Parse/TryParse` on provider amounts must use `CultureInfo.InvariantCulture`.
6. **Tests required.** Any change under src/Libraries/Nop.Services/Catalog/, src/Libraries/Nop.Services/Orders/,
   src/Libraries/Nop.Services/Payments/, or src/Plugins/Nop.Plugin.Payments.*/ must add or update tests under
   src/Tests/. If it doesn't, leave a blocking comment naming the test file that should change
   (e.g. src/Tests/Nop.Tests/Nop.Services.Tests/Catalog/PriceCalculationServiceTests.cs).
7. **Rounding tests must include negatives.** New or changed `[TestCase]` sets for rounding must include
   negative values for each `RoundingType` touched.
8. **Currency:** amounts sent to a provider must be in the order's currency and precision the provider expects
   (PayPal: 2 decimals). Flag mixed-currency arithmetic.
9. **Public API:** flag signature changes to IPriceCalculationService, IOrderTotalCalculationService,
   IPaymentMethod; plugins outside this repo depend on them.
