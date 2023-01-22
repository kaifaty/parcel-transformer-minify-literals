import CleanCSS from 'clean-css'
import {Options as HTMLOptions, minify} from 'html-minifier-terser'
import {Strategy} from './types'

/**
 * The default <code>clean-css</code> options, optimized for production
 * minification.
 */
export const defaultMinifyCSSOptions: CleanCSS.Options = {}

/**
 * The default <code>html-minifier</code> options, optimized for production
 * minification.
 */
export const defaultMinifyOptions: HTMLOptions = {
  caseSensitive: true,
  collapseWhitespace: true,
  decodeEntities: true,
  minifyCSS: defaultMinifyCSSOptions,
  minifyJS: true,
  processConditionalComments: true,
  removeAttributeQuotes: false,
  removeComments: true,
  removeEmptyAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  useShortDoctype: true,
}

/**
 * The default strategy. This uses <code>html-minifier</code> to minify HTML and
 * <code>clean-css</code> to minify CSS.
 */
export const defaultStrategy: Strategy<HTMLOptions, CleanCSS.Options> = {
  getPlaceholder(parts) {
    // Using @ and (); will cause the expression not to be removed in CSS.
    // However, sometimes the semicolon can be removed (ex: inline styles).
    // In those cases, we want to make sure that the HTML splitting also
    // accounts for the missing semicolon.
    const suffix = '();'
    let placeholder = '@TEMPLATE_EXPRESSION'
    while (parts.some((part) => part.text.includes(placeholder + suffix))) {
      placeholder += '_'
    }

    return placeholder + suffix
  },

  combineHTMLStrings(parts, placeholder) {
    return parts.map((part) => part.text).join(placeholder)
  },

  async minifyHTML(html, options = {}) {
    let minifyCSSOptions: HTMLOptions['minifyCSS']

    html = html.replaceAll('<@TEMPLATE_EXPRESSION();', '<TEMPLATE_EXPRESSION___')
    html = html.replaceAll('</@TEMPLATE_EXPRESSION();', '</TEMPLATE_EXPRESSION___')

    if (options.minifyCSS) {
      if (options.minifyCSS !== true && typeof options.minifyCSS !== 'function') {
        minifyCSSOptions = {...options.minifyCSS}
      } else {
        minifyCSSOptions = {}
      }
    } else {
      minifyCSSOptions = false
    }

    let adjustedMinifyCSSOptions: false | ReturnType<typeof adjustMinifyCSSOptions> = false
    if (minifyCSSOptions) {
      adjustedMinifyCSSOptions = adjustMinifyCSSOptions(minifyCSSOptions)
    }

    let result = await minify(html, {
      ...options,
      minifyCSS: adjustedMinifyCSSOptions,
    })

    result = result.replaceAll('<TEMPLATE_EXPRESSION___', '<@TEMPLATE_EXPRESSION();')
    result = result.replaceAll('</TEMPLATE_EXPRESSION___', '</@TEMPLATE_EXPRESSION();')

    if (options.collapseWhitespace) {
      // html-minifier does not support removing newlines inside <svg>
      // attributes. Support this, but be careful not to remove newlines from
      // supported areas (such as within <pre> and <textarea> tags).
      const matches = Array.from(result.matchAll(/<svg/g)).reverse()
      for (const match of matches) {
        const startTagIndex = (match as any).index
        const closeTagIndex = result.indexOf('</svg', startTagIndex)
        if (closeTagIndex < 0) {
          // Malformed SVG without a closing tag
          continue
        }

        const start = result.substring(0, startTagIndex)
        let svg = result.substring(startTagIndex, closeTagIndex)
        const end = result.substring(closeTagIndex)
        svg = svg.replace(/\r?\n/g, '')
        result = start + svg + end
      }
    }
    result = fixCleanCssTidySelectors(html, result)

    return result
  },
  async minifyCSS(css, options = {}) {
    const adjustedOptions = adjustMinifyCSSOptions(options)
    const output = await new CleanCSS({
      ...adjustedOptions,
      returnPromise: true,
    }).minify(css)

    if (output.errors?.length) throw new Error(output.errors.join('\n\n'))
    if (output.warnings.length) {
      return fixCleanCssTidySelectors(css, css.replace(/(\n)|(\r)|(  )/g, ''))
    }
    return fixCleanCssTidySelectors(css, output.styles)
  },
  splitHTMLByPlaceholder(html, placeholder) {
    const parts = html.split(placeholder)
    // Make the last character (a semicolon) optional. See above.
    if (placeholder.endsWith(';')) {
      const withoutSemicolon = placeholder.substring(0, placeholder.length - 1)
      for (let i = parts.length - 1; i >= 0; i--) {
        parts.splice(i, 1, ...parts[i]!.split(withoutSemicolon))
      }
    }

    return parts
  },
}

export function adjustMinifyCSSOptions(options: CleanCSS.Options = {}) {
  const level = options.level

  const plugin = {
    level1: {
      value: function (_name: any, value: string) {
        if (!value.startsWith('@TEMPLATE_EXPRESSION') || value.endsWith(';')) return value

        // The CSS minifier has removed the semicolon from the placeholder
        // and we need to add it back.
        return `${value};`
      },
    },
  }

  return {
    ...options,
    level: {
      2: {
        all: false, // sets all values to `false`
        removeDuplicateRules: true, // turns on removing duplicate rules
      },
    },
  }
}

// Should be fixed in clean-css https://github.com/clean-css/clean-css/issues/996, but is still happening
function fixCleanCssTidySelectors(original: string, result: string) {
  const regex = /(::?.+\((.*)\))[\s\r\n]*{/gm
  let match: RegExpMatchArray | null
  while ((match = regex.exec(original)) != null) {
    const pseudoClass = match[1] ?? ''
    const parameters = match[2]

    if (!parameters?.match(/\s/)) {
      continue
    }

    const parametersWithoutSpaces = parameters.replace(/\s/g, '')
    const resultPseudoClass = pseudoClass.replace(parameters, parametersWithoutSpaces)
    const resultStartIndex = result.indexOf(resultPseudoClass)
    if (resultStartIndex < 0) {
      continue
    }

    const resultEndIndex = resultStartIndex + resultPseudoClass.length
    // Restore the original pseudo class with spaces
    result = result.substring(0, resultStartIndex) + pseudoClass + result.substring(resultEndIndex)
  }

  return result
}
