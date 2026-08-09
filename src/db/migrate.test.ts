import { describe, it } from '@std/testing/bdd'
import { expect } from '@std/expect'
import { splitStatements } from './sql.ts'

describe('splitStatements', () => {
  it('splits on semicolons and trims', () => {
    expect(splitStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('drops blank statements from trailing/double semicolons', () => {
    expect(splitStatements('SELECT 1;;\n\n')).toEqual(['SELECT 1'])
  })

  it('strips full-line -- comments', () => {
    const sql = '-- a comment\nSELECT 1;\n-- another\nSELECT 2;'
    expect(splitStatements(sql)).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('does NOT split on a semicolon that lives inside a -- comment', () => {
    // This is the bug a live migration caught: the comment's own semicolon
    // must not be treated as a statement boundary.
    const sql = [
      'INSERT INTO t VALUES (1)',
      '-- guard note (version-agnostic; no NULLS NOT DISTINCT needed)',
      'ON CONFLICT DO NOTHING;',
    ].join('\n')
    const stmts = splitStatements(sql)
    expect(stmts.length).toBe(1)
    expect(stmts[0]).toContain('INSERT INTO t VALUES (1)')
    expect(stmts[0]).toContain('ON CONFLICT DO NOTHING')
    expect(stmts[0]).not.toContain('no NULLS')
  })

  it('strips a trailing inline comment but keeps the code before it', () => {
    const stmts = splitStatements('SELECT 1; -- trailing note\nSELECT 2;')
    expect(stmts).toEqual(['SELECT 1', 'SELECT 2'])
  })
})
