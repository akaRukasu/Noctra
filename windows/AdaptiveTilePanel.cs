using System;
using System.Windows;
using System.Windows.Controls;

namespace Noctra.Windows;

// Arrange cells directly: rounded child widths must never decide whether a row wraps.
public sealed class AdaptiveTilePanel : Panel
{
    public double MinimumCellWidth { get; set; } = 260;
    public int MaximumColumns { get; set; } = 4;
    public bool BalanceFour { get; set; }
    // 0.8 : grilles d'affiches : même nombre de colonnes même avec peu de titres (pas d'affiche géante).
    public bool KeepColumns { get; set; }
    private int columns = 1;
    private double rowHeight;

    internal static int ColumnsFor(double width, int count, double minimum, int maximum, bool balance, bool keep = false)
    {
        var result = Math.Min(keep ? int.MaxValue : Math.Max(1, count), Math.Clamp((int)Math.Floor(Math.Max(0, width) / minimum), 1, maximum));
        return balance && count == 4 && result == 3 ? 2 : result;
    }

    protected override Size MeasureOverride(Size available)
    {
        if (InternalChildren.Count == 0) return new Size();
        var width = double.IsFinite(available.Width) ? available.Width : MinimumCellWidth * Math.Min(MaximumColumns, InternalChildren.Count);
        columns = ColumnsFor(width, InternalChildren.Count, MinimumCellWidth, MaximumColumns, BalanceFour, KeepColumns);
        rowHeight = 0;
        foreach (UIElement child in InternalChildren)
        {
            child.Measure(new Size(width / columns, double.PositiveInfinity));
            rowHeight = Math.Max(rowHeight, child.DesiredSize.Height);
        }
        return new Size(width, rowHeight * Math.Ceiling((double)InternalChildren.Count / columns));
    }

    protected override Size ArrangeOverride(Size final)
    {
        var dpi = System.Windows.Media.VisualTreeHelper.GetDpi(this).DpiScaleX;
        for (var index = 0; index < InternalChildren.Count; index++)
        {
            var column = index % columns;
            var left = Math.Round(final.Width * column / columns * dpi) / dpi;
            var right = Math.Round(final.Width * (column + 1) / columns * dpi) / dpi;
            InternalChildren[index].Arrange(new Rect(left, index / columns * rowHeight, Math.Max(0, right - left), rowHeight));
        }
        return final;
    }
}

// 0.8 : surface dont la hauteur suit la largeur (affiches, vignettes) : les images remplissent
// la colonne disponible sans bandes vides, quelle que soit la largeur de la fenêtre.
public sealed class AspectGrid : Grid
{
    public double Ratio { get; set; } = 1.5;

    protected override Size MeasureOverride(Size available)
    {
        if (!double.IsFinite(available.Width) || Ratio <= 0) return base.MeasureOverride(available);
        var size = new Size(available.Width, Math.Round(available.Width * Ratio));
        base.MeasureOverride(size);
        return size;
    }
}
