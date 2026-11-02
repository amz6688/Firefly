import type { ProfileConfig } from "../types/profileConfig";

export const profileConfig: ProfileConfig = {
	// 头像
	// 图片路径支持三种格式：
	// 1. public 目录（以 "/" 开头，不优化）："/assets/images/avatar.webp"
	// 2. src 目录（不以 "/" 开头，自动优化但会增加构建时间，推荐）："assets/images/avatar.webp"
	// 3. 远程 URL："https://example.com/avatar.jpg"
	avatar: "/assets/images/logo.png",

	// 名字
	name: "猫猫游戏库",

	// 个人签名
	bio: "Steam移植手游 · 安卓单机游戏库，每日更新中。",

	// 链接配置
	// 已经预装的图标集：fa7-brands，fa7-regular，fa7-solid，material-symbols，simple-icons
	// 访问https://icones.js.org/ 获取图标代码，
	// 如果想使用尚未包含相应的图标集，则需要安装它
	// `pnpm add @iconify-json/<icon-set-name>`
	// showName: true 时显示图标和名称，false 时只显示图标
	links: [
		{
			name: "关于本站",
			icon: "material-symbols:info",
			url: "/about/",
			showName: true,
		},
		{
			name: "在线表格",
			icon: "material-symbols:table-chart",
			url: "https://pan.quark.cn/s/42213385090b",
			showName: true,
		},
		{
			name: "搜索",
			icon: "material-symbols:search",
			url: "/search/",
			showName: true,
		},
	],
};
