import { minifyHTMLLiterals } from "minify-literals";
import { Transformer } from "@parcel/plugin";

export default new Transformer({
  async transform({ asset }) {
    const source = await asset.getCode();
    const res = await minifyHTMLLiterals(source);
    asset.setCode(res.code);
    return [asset];
  },
});
