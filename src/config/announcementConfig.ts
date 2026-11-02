import type { AnnouncementConfig } from "../types/announcementConfig";

export const announcementConfig: AnnouncementConfig = {
	// 公告标题，留空则走i18n默认标题
	title: "公告",

	// 公告内容（留空则不显示公告卡片）
	content: "",

	// 是否允许用户关闭公告
	closable: true,

	link: {
		// 启用链接
		enable: false,
		// 链接文本
		text: "",
		// 链接 URL
		url: "",
		// 内部链接
		external: true,
	},
};
