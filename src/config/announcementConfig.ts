import type { AnnouncementConfig } from "../types/announcementConfig";

export const announcementConfig: AnnouncementConfig = {
	// 公告标题，留空则走i18n默认标题
	title: "公告",

	// 公告内容
	content:
		"高峰期网站访问较慢，可到游戏库在线表格快速获取网盘下载链接。",

	// 是否允许用户关闭公告
	closable: true,

	link: {
		// 启用链接
		enable: true,
		// 链接文本
		text: "夸克网盘入口",
		// 链接 URL
		url: "https://pan.quark.cn/s/42213385090b",
		// 内部链接
		external: true,
	},
};
