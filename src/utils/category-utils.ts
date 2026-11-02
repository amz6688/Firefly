export type PostCategoryValue = string | string[] | null | undefined;

/** 统一把文章分类字段转成字符串数组（兼容旧的单分类写法） */
export function normalizeCategories(value: PostCategoryValue): string[] {
	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean);
	}
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? [trimmed] : [];
	}
	return [];
}

/** 取第一个分类，用于只需要单个分类名的场景（如面包屑） */
export function primaryCategory(value: PostCategoryValue): string {
	return normalizeCategories(value)[0] ?? "";
}
