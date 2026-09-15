import { HomeOverview } from "@spine/shell/home-overview";
import { ErpOverview } from "@spine/erp/overview";
import { PRODUCT_PROFILE } from "@spine/product/profile";

export default function HomePage(): React.JSX.Element { return PRODUCT_PROFILE.phase === "1" ? <ErpOverview /> : <HomeOverview />; }
