import { getSql } from '../connection.ts'
import { toIso } from '../rows.ts'

type Row = Record<string, unknown>

export interface Category {
  id: string
  name: string
  parentId: string | null
  isSeed: boolean
  createdAt: string
}

function rowToCategory(row: Record<string, unknown>): Category {
  return {
    id: row.id as string,
    name: row.name as string,
    parentId: (row.parent_id as string) ?? null,
    isSeed: row.is_seed as boolean,
    createdAt: toIso(row.created_at),
  }
}

export interface CategoryNode {
  id: string
  name: string
  isSeed: boolean
  children: { id: string; name: string; isSeed: boolean }[]
}

export async function listCategories(): Promise<CategoryNode[]> {
  const sql = getSql()
  const rows = await sql`SELECT id, name, parent_id, is_seed FROM categories ORDER BY name` as Row[]
  const all = rows.map(rowToCategory)
  const parents = all.filter((c) => c.parentId === null)
  return parents.map((p) => ({
    id: p.id,
    name: p.name,
    isSeed: p.isSeed,
    children: all
      .filter((c) => c.parentId === p.id)
      .map((c) => ({ id: c.id, name: c.name, isSeed: c.isSeed })),
  }))
}

export interface CategoryMatch {
  categoryId: string
  subcategoryId: string | null
  path: string
}

export async function findCategory(
  categoryName: string,
  subcategoryName?: string | null,
): Promise<CategoryMatch | null> {
  const sql = getSql()

  const parents = await sql`
    SELECT id, name FROM categories
    WHERE parent_id IS NULL AND LOWER(name) = LOWER(${categoryName})
  ` as Row[]
  if (parents.length === 0) return null

  const parent = parents[0]
  const parentId = parent.id as string
  if (!subcategoryName) {
    return { categoryId: parentId, subcategoryId: null, path: parent.name as string }
  }

  const children = await sql`
    SELECT id, name FROM categories
    WHERE parent_id = ${parentId} AND LOWER(name) = LOWER(${subcategoryName})
  ` as Row[]
  if (children.length === 0) {
    return { categoryId: parentId, subcategoryId: null, path: parent.name as string }
  }

  return {
    categoryId: parentId,
    subcategoryId: children[0].id as string,
    path: `${parent.name} > ${children[0].name}`,
  }
}

export async function findOrCreateCategory(
  categoryName: string,
  subcategoryName?: string | null,
): Promise<CategoryMatch & { created: boolean }> {
  const existing = await findCategory(categoryName, subcategoryName)
  if (existing && (existing.subcategoryId || !subcategoryName)) {
    return { ...existing, created: false }
  }

  const sql = getSql()

  let parentId: string
  let parentName: string
  let created = false

  if (existing) {
    parentId = existing.categoryId
    parentName = existing.path
  } else {
    const parentRows = await sql`
      SELECT id, name FROM categories
      WHERE parent_id IS NULL AND LOWER(name) = LOWER(${categoryName})
    ` as Row[]
    if (parentRows.length > 0) {
      parentId = parentRows[0].id as string
      parentName = parentRows[0].name as string
    } else {
      const inserted = await sql`
        INSERT INTO categories (name, parent_id, is_seed) VALUES (${categoryName}, ${null}, false)
        RETURNING id, name
      ` as Row[]
      parentId = inserted[0].id as string
      parentName = inserted[0].name as string
      created = true
    }
  }

  if (!subcategoryName) {
    return { categoryId: parentId, subcategoryId: null, path: parentName, created }
  }

  const newSub = await sql`
    INSERT INTO categories (name, parent_id, is_seed) VALUES (${subcategoryName}, ${parentId}, false)
    ON CONFLICT (name, parent_id) DO NOTHING
    RETURNING id, name
  ` as Row[]

  if (newSub.length > 0) {
    return {
      categoryId: parentId,
      subcategoryId: newSub[0].id as string,
      path: `${parentName} > ${newSub[0].name}`,
      created: true,
    }
  }

  const refetched = await findCategory(categoryName, subcategoryName)
  return { ...refetched!, created: false }
}

export async function getCategoryNames(): Promise<string[]> {
  const sql = getSql()
  const rows = await sql`SELECT name FROM categories WHERE parent_id IS NULL ORDER BY name` as Row[]
  return rows.map((r) => r.name as string)
}
