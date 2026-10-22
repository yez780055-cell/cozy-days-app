import { assets, type AssetName } from '../assets/manifest';
import fallbackStar from '../assets/fallback-star.svg?raw';
// The approved SVG is embedded in the bundle, so fallback also works offline.
const fallbackUrl = `data:image/svg+xml,${encodeURIComponent(fallbackStar)}`;
export function Asset({ name, className = '' }: { name: AssetName; className?: string }) {
  const asset = assets[name];
  return <img className={`asset ${className}`} src={asset.file} alt="" aria-hidden="true"
    width={asset.width} height={asset.height} decoding="async" draggable={false}
    onError={event => { const img = event.currentTarget; if (img.src !== fallbackUrl) { img.src = fallbackUrl; img.style.aspectRatio = '1 / 1'; } }}
    style={{ aspectRatio: `${asset.width} / ${asset.height}`, objectFit: asset.fit, objectPosition: asset.anchor }} />;
}
