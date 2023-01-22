import { minifyHTMLLiterals } from "minify-literals";
import { Transformer } from "@parcel/plugin";

export default new Transformer({
  async transform({ asset }) {
    // Retrieve the asset's source code and source map.
    const source = await asset.getCode();
    const res = await minifyHTMLLiterals(source);
    // Run it through some compiler, and set the results
    // on the asset.
    asset.setCode(res.code);
    console.log(res.code);

    // Return the asset
    return [asset];
  },
});
