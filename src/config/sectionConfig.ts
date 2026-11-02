// 首页板块配置 - 分类导航栏与导航入口共用
// kind: latest 表示首页（最新板块），category 按文章分类筛选，tag 按文章标签筛选
export type SectionKind = "latest" | "category" | "tag";

export interface SiteSection {
	name: string;
	/** 空字符串表示首页（最新板块） */
	slug: string;
	kind: SectionKind;
	/** 分类名或标签名，latest 无需填写 */
	value?: string;
	icon: string;
}

export const sectionConfig: SiteSection[] = [
	{
		name: "最新",
		slug: "",
		kind: "latest",
		icon: "material-symbols:fiber-new",
	},
	{
		name: "必玩榜",
		slug: "must-play",
		kind: "tag",
		value: "必玩榜",
		icon: "material-symbols:star-rounded",
	},
	{
		name: "Steam移植",
		slug: "steam",
		kind: "category",
		value: "Steam移植",
		icon: "fa7-brands:steam",
	},
	{
		name: "手柄专区",
		slug: "controller",
		kind: "tag",
		value: "手柄专区",
		icon: "fa7-solid:gamepad",
	},
	{
		name: "安卓原生",
		slug: "android",
		kind: "category",
		value: "安卓原生",
		icon: "fa7-brands:android",
	},
	{
		name: "反编译移植",
		slug: "decompile",
		kind: "category",
		value: "反编译移植",
		icon: "material-symbols:smartphone",
	},
];
