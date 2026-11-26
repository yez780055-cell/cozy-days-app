import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { LunarYear, Lunar } from 'lunar-typescript';

test('lunar migration validates new and old records without modifying the caller', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id bigint primary key, email_verified boolean);
      create function auth.uid() returns text language sql as $$select null::text$$;
      create function auth.role() returns text language sql as $$select null::text$$;
      create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;`);
    await db.exec(await readFile('cloudbase/001_shared_space.sql', 'utf8'));
    const migration = await readFile('cloudbase/003_lunar_validation.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration); // the additive migration is repeatable
    const base = {id:42,name:'Synthetic',date:'2023-03-22',note:'',icon:'',theme:'生活',color:'pink',yearly:true,createdAt:1,updatedAt:1};
    const validate = async value => (await db.query('select cozy_days_private.validate_record($1,$2,$3::jsonb) as reason', ['anniversary','42',JSON.stringify(value)])).rows[0].reason;
    assert.equal(await validate(base), null);
    assert.equal(await validate({...base,calendar:'lunar',lunarDate:{year:2023,month:-2,day:1}}), null);
    assert.equal(await validate({...base,date:'2023-03-23',calendar:'lunar',lunarDate:{year:2023,month:-2,day:1},unknown:'preserve'}), 'invalid');
    assert.equal(await validate({...base,calendar:'lunar',lunarDate:{year:2023,month:-7,day:31}}), 'invalid');
    assert.equal(await validate({...base,calendar:'lunar'}), 'invalid');
    assert.equal(await validate({...base,calendar:'solar',specialDays:[100,1000]}), null);
    assert.equal(await validate({...base,specialDays:[0]}), 'invalid');
    assert.equal(await validate({...base,specialDays:'not an array'}), 'invalid');
    const decimalIntegers = JSON.stringify({...base, calendar:'lunar', lunarDate:{year:2023,month:-2,day:1},specialDays:[100]})
      .replace('"year":2023','"year":2023.0').replace('"month":-2','"month":-2.0').replace('"day":1','"day":1.0');
    assert.equal((await db.query('select cozy_days_private.validate_record($1,$2,$3::jsonb) as reason',
      ['anniversary','42',decimalIntegers])).rows[0].reason, null);
    // Compare month boundaries and leap months across the full picker range, including the calendar reform.
    for (const year of [1000, 1400, 1500, 1582, 1583, 1900, 2000, 2023, 2100, 9998]) {
      for (const month of LunarYear.fromYear(year).getMonths().filter(m => m.getYear() === year)) {
        for (const day of [1, month.getDayCount()]) {
          const date = Lunar.fromYmd(year, month.getMonth(), day).getSolar().toYmd();
          // Invalid civil dates are rejected by the existing base validation.
          const validCivil = /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date+'T12:00:00Z').toISOString().startsWith(date);
          if (!validCivil) continue;
          assert.equal(await validate({...base,date,calendar:'lunar',lunarDate:{year,month:month.getMonth(),day}}), null, `${year}/${month.getMonth()}/${day} ${date}`);
        }
      }
    }
  } finally { await db.close(); }
});
