# Literals minifier for Parcel

Libs like `Lit` using string literals to template code. Parcel by default don't minify this cases.

Under the hood used `minify-literals` from [Henry Gressmann](https://github.com/explodingcamera/esm/tree/main/packages/minify-literals)

## Usage example

```JSON
//.parcelrc

{
  "extends": "@parcel/config-default",
  "transformers": {
    "*.{js,mjs,jsm,jsx,es6,cjs,ts,tsx}": ["parcel-transformer-minify-literals", "..."]
  }
}
```
