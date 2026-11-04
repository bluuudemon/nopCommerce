using AwesomeAssertions;
using Nop.Web.Factories;
using NUnit.Framework;

namespace Nop.Tests.Nop.Web.Tests.Public.Factories;

[TestFixture]
public class FreeShippingProgressCalculatorTests
{
    [Test]
    public void RemainingIsThresholdMinusSubtotalWhenBelow()
    {
        var result = FreeShippingProgressCalculator.Calculate(true, 100m, 87.50m, true, false);

        result.Show.Should().BeTrue();
        result.IsQualified.Should().BeFalse();
        result.Remaining.Should().Be(12.50m);
        result.ProgressRatio.Should().Be(0.875m);
    }

    [Test]
    public void AtThresholdNothingRemainsButShippingIsNotUnlocked()
    {
        // Free shipping over X uses a strict greater-than comparison, so an exact match is not free yet.
        var result = FreeShippingProgressCalculator.Calculate(true, 75m, 75m, true, false);

        result.Show.Should().BeTrue();
        result.IsQualified.Should().BeFalse();
        result.Remaining.Should().Be(0m);
        result.ProgressRatio.Should().Be(1m);
    }

    [Test]
    public void AboveThresholdIsQualifiedWithNoRemaining()
    {
        var result = FreeShippingProgressCalculator.Calculate(true, 75m, 80m, true, false);

        result.Show.Should().BeTrue();
        result.IsQualified.Should().BeTrue();
        result.Remaining.Should().Be(0m);
        result.ProgressRatio.Should().Be(1m);
    }

    [Test]
    public void SettingOffHidesTheBar()
    {
        var result = FreeShippingProgressCalculator.Calculate(false, 75m, 80m, true, false);

        result.Show.Should().BeFalse();
        result.Remaining.Should().Be(0m);
        result.IsQualified.Should().BeFalse();
    }

    [Test]
    public void EmptyCartHidesTheBar()
    {
        var result = FreeShippingProgressCalculator.Calculate(true, 75m, 40m, false, false);

        result.Show.Should().BeFalse();
        result.Remaining.Should().Be(0m);
    }

    [Test]
    public void NonPositiveThresholdHidesTheBar()
    {
        FreeShippingProgressCalculator.Calculate(true, 0m, 10m, true, false).Show.Should().BeFalse();
        FreeShippingProgressCalculator.Calculate(true, -5m, 10m, true, false).Show.Should().BeFalse();
    }

    [Test]
    public void AlreadyFreeShippingCompletesTheBarBelowTheThreshold()
    {
        var result = FreeShippingProgressCalculator.Calculate(true, 100m, 40m, true, true);

        result.Show.Should().BeTrue();
        result.IsQualified.Should().BeTrue();
        result.Remaining.Should().Be(0m);
        result.ProgressRatio.Should().Be(1m);
    }
}
