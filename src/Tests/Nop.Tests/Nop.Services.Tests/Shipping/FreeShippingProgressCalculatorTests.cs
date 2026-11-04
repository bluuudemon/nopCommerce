using AwesomeAssertions;
using Nop.Services.Shipping;
using NUnit.Framework;

namespace Nop.Tests.Nop.Services.Tests.Shipping;

[TestFixture]
public class FreeShippingProgressCalculatorTests
{
    [Test]
    public void RemainingAmountIsThresholdMinusSubtotalWhenBelow()
    {
        // One Nike Floral Roshe at $40 against a $75 threshold.
        FreeShippingProgressCalculator.GetRemainingAmount(40m, 75m).Should().Be(35m);
    }

    [Test]
    public void RemainingAmountKeepsFractionalCurrency()
    {
        FreeShippingProgressCalculator.GetRemainingAmount(39.50m, 75m).Should().Be(35.50m);
        FreeShippingProgressCalculator.GetRemainingAmount(74.99m, 75m).Should().Be(0.01m);
    }

    [Test]
    public void RemainingAmountIsTheFullThresholdWhenTheCartSubtotalIsZero()
    {
        FreeShippingProgressCalculator.GetRemainingAmount(0m, 75m).Should().Be(75m);
    }

    [Test]
    public void RemainingAmountIsZeroAtTheThreshold()
    {
        // Nothing further to add once the subtotal meets the threshold.
        // The shipping rule itself still requires a subtotal greater than the threshold;
        // the progress percent stays short of 100 until that happens.
        FreeShippingProgressCalculator.GetRemainingAmount(75m, 75m).Should().Be(0m);
    }

    [Test]
    public void RemainingAmountIsZeroAboveTheThreshold()
    {
        FreeShippingProgressCalculator.GetRemainingAmount(80m, 75m).Should().Be(0m);
        FreeShippingProgressCalculator.GetRemainingAmount(150.25m, 75m).Should().Be(0m);
    }

    [Test]
    public void RemainingAmountIsZeroWhenTheThresholdIsNotPositive()
    {
        FreeShippingProgressCalculator.GetRemainingAmount(40m, 0m).Should().Be(0m);
        FreeShippingProgressCalculator.GetRemainingAmount(40m, -10m).Should().Be(0m);
    }

    [Test]
    public void RemainingAmountIncludesANegativeSubtotal()
    {
        FreeShippingProgressCalculator.GetRemainingAmount(-10m, 75m).Should().Be(85m);
    }

    [Test]
    public void ProgressPercentTracksTheSubtotalAndCompletesOnlyAfterTheThreshold()
    {
        FreeShippingProgressCalculator.GetProgressPercent(0m, 75m).Should().Be(0);
        FreeShippingProgressCalculator.GetProgressPercent(40m, 75m).Should().Be(53);
        FreeShippingProgressCalculator.GetProgressPercent(75m, 75m).Should().Be(99);
        FreeShippingProgressCalculator.GetProgressPercent(75.01m, 75m).Should().Be(100);
        FreeShippingProgressCalculator.GetProgressPercent(80m, 75m).Should().Be(100);
    }

    [Test]
    public void ProgressPercentIsFullForAPositiveSubtotalWhenTheThresholdIsZero()
    {
        FreeShippingProgressCalculator.GetProgressPercent(0m, 0m).Should().Be(0);
        FreeShippingProgressCalculator.GetProgressPercent(1m, 0m).Should().Be(100);
    }
}
