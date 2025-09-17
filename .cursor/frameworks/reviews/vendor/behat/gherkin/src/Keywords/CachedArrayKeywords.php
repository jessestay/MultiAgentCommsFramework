<?php

/*
 * This file is part of the Behat Gherkin Parser.
 * (c) Konstantin Kudryashov <ever.zet@gmail.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace Behat\Gherkin\Keywords;

use Behat\Gherkin\Node\StepNode;

/**
 * Keywords dumper that loads keywords from the Gherkin lexer.
 *
 * @author Konstantin Kudryashov <ever.zet@gmail.com>
 */
class CachedArrayKeywords implements Keywords
{
    private static $keywords;
    private $path;

    /**
     * Initializes keywords.
     *
     * @param string $path Path to a i18n file
     */
    public function __construct($path = null)
    {
        $this->path = $path;
    }

    /**
     * {@inheritdoc}
     */
    public function getKeywords($language)
    {
        $this->loadKeywords();

        return isset(self::$keywords[$language]) ? self::$keywords[$language] : null;
    }

    /**
     * {@inheritdoc}
     */
    public function getKeywordsAst($language)
    {
        if (!isset(self::$keywords[$language])) {
            return null;
        }

        return $this->prepareKeywordsAst(self::$keywords[$language]);
    }

    private function loadKeywords()
    {
        if (null === self::$keywords) {
            require __DIR__ . '/../../i18n.php';

            self::$keywords = $GLOBALS['BEHAT_GHERKIN_I18N'];
            unset($GLOBALS['BEHAT_GHERKIN_I18N']);
        }
    }

    /**
     * Prepares keywords list to be used in AST.
     *
     * @param string $keywordsString
     *
     * @return array
     */
    private function prepareKeywordsAst($keywordsString)
    {
        $keywords = array();
        foreach (explode('|', $keywordsString) as $keyword) {
            if ('*' === $keyword) {
                continue;
            }

            $keywords[] = $keyword;
        }

        return $keywords;
    }
}
