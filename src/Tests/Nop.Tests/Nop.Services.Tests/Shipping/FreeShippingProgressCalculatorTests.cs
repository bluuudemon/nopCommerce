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
        FreeShippingProgressCalculator.GetRemainingAmount(40m, 75m).Should().Be(35m);
    }

    [Test]
    public void RemainingAmountIsZeroAtTheThreshold()
    {
        FreeShippingProgressCalculator.GetRemainingAmount(75m, 75m).Should().Be(0m);
    }

    [Test]
    public void RemainingAmountIsZeroWhenTheThresholdIsNotPositive()
    {
        FreeShippingProgressCalculator.GetRemainingAmount(40m, 0m).Should().Be(0m);
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
}
