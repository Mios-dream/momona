declare const __MOMONA_VERSION__: string;
declare const __MOMONA_REVISION__: string;

declare module "*.png" {
  const metadata: { src: string; width: number; height: number; format: string };
  export default metadata;
}
