import MagicString from "magic-string";
import { Template, parseLiterals } from "parse-literals";
import { defaultMinifyOptions, defaultStrategy } from "./strategy";
import {
  CustomOptions,
  DefaultOptions,
  MagicStringLike,
  Options,
  Result,
  SourceMap,
  Strategy,
  Validation,
} from "./types.js";

/**
 * The default method to generate a SourceMap. It will generate the SourceMap
 * from the provided MagicString instance using "fileName.map" as the file and
 * "fileName" as the source.
 *
 * @param ms the MagicString instance with code modifications
 * @param fileName the name of the source file
 * @returns a v3 SourceMap
 */
export function defaultGenerateSourceMap(
  ms: MagicStringLike,
  fileName: string
) {
  return ms.generateMap({
    file: `${fileName}.map`,
    source: fileName,
    hires: true,
  });
}

/**
 * The default method to determine whether or not to minify a template. It will
 * return true for all tagged templates whose tag name contains "html" (case
 * insensitive).
 *
 * @param template the template to check
 * @returns true if the template should be minified
 */
export function defaultShouldMinify(template: Template) {
  const tag = template.tag?.toLowerCase();
  return !!tag && (tag.includes("html") || tag.includes("svg"));
}

/**
 * The default method to determine whether or not to minify a CSS template. It
 * will return true for all tagged templates whose tag name contains "css" (case
 * insensitive).
 *
 * @param template the template to check
 * @returns true if the template should be minified
 */
export function defaultShouldMinifyCSS(template: Template) {
  if (!template?.tag?.toLowerCase().includes("css")) return false;
  return true;
}

/**
 * The default validation.
 */
export const defaultValidation: Validation = {
  ensurePlaceholderValid(placeholder) {
    if (typeof placeholder !== "string" || !placeholder.length) {
      throw new Error("getPlaceholder() must return a non-empty string");
    }
  },
  ensureHTMLPartsValid(parts, htmlParts) {
    if (parts.length !== htmlParts.length) {
      throw new Error(
        "splitHTMLByPlaceholder() must return same number of strings as template parts" +
          JSON.stringify({ parts, htmlParts })
      );
    }
  },
};

/**
 * Minifies all HTML template literals in the provided source string.
 *
 * @param source the source code
 * @param options minification options
 * @returns the minified code, or null if no minification occurred.
 */
export async function minifyHTMLLiterals(
  source: string,
  options?: DefaultOptions
): Promise<Result | null>;
/**
 * Minifies all HTML template literals in the provided source string.
 *
 * @param source the source code
 * @param options minification options
 * @returns the minified code, or null if no minification occurred.
 */
export async function minifyHTMLLiterals<S extends Strategy>(
  source: string,
  options?: CustomOptions<S>
): Promise<Result | null>;

export async function minifyHTMLLiterals(
  source: string,
  options: Options = {}
): Promise<Result | null> {
  options.MagicString = options.MagicString || MagicString;
  options.parseLiterals = options.parseLiterals || parseLiterals;
  options.shouldMinify = options.shouldMinify || defaultShouldMinify;
  options.shouldMinifyCSS = options.shouldMinifyCSS || defaultShouldMinifyCSS;

  options.minifyOptions = {
    ...defaultMinifyOptions,
    ...options.minifyOptions,
  };

  options.parseLiteralsOptions = {
    fileName: options.fileName!,
    ...options.parseLiteralsOptions,
  };

  const templates = options.parseLiterals(source, options.parseLiteralsOptions);
  const strategy =
    <Strategy>(<CustomOptions<any>>options).strategy || defaultStrategy;
  const { shouldMinify, shouldMinifyCSS } = options;
  let validate: Validation | undefined;
  if (options.validate !== false) {
    validate = options.validate || defaultValidation;
  }

  let skipCSS = false;
  let skipHTML = false;

  if (strategy.minifyCSS && source.includes("unsafeCSS")) {
    console.warn(
      `minify-html-literals: unsafeCSS() detected in source. CSS minification will not be performed for this file.`
    );
    skipCSS = true;
  }

  if (source.includes("unsafeHTML")) {
    console.warn(
      `minify-html-literals: unsafeHTML() detected in source. HTML minification will not be performed for this file.`
    );
    skipHTML = true;
  }

  const ms = new options.MagicString(source);

  let promises = templates.map(async (template) => {
    const minifyHTML = !skipHTML && shouldMinify(template);
    const minifyCSS =
      !skipCSS && strategy.minifyCSS && shouldMinifyCSS(template);

    if (!(minifyHTML || minifyCSS)) return;

    const placeholder = strategy.getPlaceholder(template.parts);
    if (validate) {
      validate.ensurePlaceholderValid(placeholder);
    }

    const combined = strategy.combineHTMLStrings(template.parts, placeholder);
    let min: string;

    if (minifyCSS) {
      const minifyCSSOptions = (options as DefaultOptions).minifyOptions
        ?.minifyCSS;
      if (typeof minifyCSSOptions === "function") {
        min = minifyCSSOptions(combined);
      } else if (minifyCSSOptions === false) {
        min = combined;
      } else {
        const cssOptions =
          typeof minifyCSSOptions === "object" ? minifyCSSOptions : undefined;
        min = await strategy.minifyCSS!(combined, cssOptions);
      }
    } else {
      min = await strategy.minifyHTML(combined, options.minifyOptions);
    }
    const minParts = strategy.splitHTMLByPlaceholder(min, placeholder);
    if (validate) validate.ensureHTMLPartsValid(template.parts, minParts);

    for (let [index, part] of template.parts.entries()) {
      if (part.start < part.end)
        // Only overwrite if the literal part has text content
        ms.overwrite(part.start, part.end, minParts[index]!);
    }
  });

  await Promise.all(promises);

  const sourceMin = ms.toString();
  if (source === sourceMin) return null;

  let map: SourceMap | undefined;
  if (options.generateSourceMap !== false) {
    const generateSourceMap =
      options.generateSourceMap || defaultGenerateSourceMap;
    map = generateSourceMap(ms, options.fileName || "");
  }

  return {
    map,
    code: sourceMin,
  };
}
