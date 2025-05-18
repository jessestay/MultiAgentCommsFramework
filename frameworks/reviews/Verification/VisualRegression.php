<?php
namespace AustinShows\Reviews\Verification;

class VisualRegression
{
    private $baselinePath;
    private $currentPath;
    private $diffPath;

    public function __construct($baselinePath, $currentPath, $diffPath)
    {
        $this->baselinePath = $baselinePath;
        $this->currentPath = $currentPath;
        $this->diffPath = $diffPath;
    }

    /**
     * Compare all screenshots between baseline and current directories.
     *
     * @param float $threshold
     * @return array
     */
    public function compare_all_screenshots($threshold = 5.0)
    {
        $results = [];
        $baselineFiles = glob($this->baselinePath . '/*.png');
        foreach ($baselineFiles as $baselineFile) {
            $filename = basename($baselineFile);
            $currentFile = $this->currentPath . '/' . $filename;
            if (!file_exists($currentFile)) {
                $results[] = [
                    'file' => $filename,
                    'passed' => false,
                    'reason' => 'Current screenshot missing',
                ];
                continue;
            }
            // For demonstration, just compare file sizes (replace with real image diff in production)
            $baselineSize = filesize($baselineFile);
            $currentSize = filesize($currentFile);
            $diff = abs($baselineSize - $currentSize);
            $passed = $diff <= $threshold * 1000; // crude threshold
            $results[] = [
                'file' => $filename,
                'passed' => $passed,
                'diff' => $diff,
                'baseline' => $baselineSize,
                'current' => $currentSize,
            ];
        }
        return $results;
    }

    /**
     * Generate an HTML report for visual comparison results.
     *
     * @param array $results
     * @param string $reportPath
     * @return bool
     */
    public function generate_html_report($results, $reportPath)
    {
        $html = "<html><head><title>Visual Comparison Report</title></head><body>";
        $html .= "<h1>Visual Comparison Report</h1><table border='1'><tr><th>File</th><th>Passed</th><th>Diff</th></tr>";
        foreach ($results as $result) {
            $html .= "<tr>";
            $html .= "<td>" . htmlspecialchars($result['file']) . "</td>";
            $html .= "<td>" . ($result['passed'] ? 'PASSED' : 'FAILED') . "</td>";
            $html .= "<td>" . (isset($result['diff']) ? $result['diff'] : '-') . "</td>";
            $html .= "</tr>";
        }
        $html .= "</table></body></html>";
        file_put_contents($reportPath, $html);
        return file_exists($reportPath) && filesize($reportPath) > 0;
    }
} 