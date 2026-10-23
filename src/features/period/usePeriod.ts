import { useEffect, useRef, useState } from 'react';
import { emptyData, type PeriodData } from './model';
import { periodRepository } from './repository';

export function usePeriod() {
  const [data,setData] = useState(emptyData);
  const current = useRef(data);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState('');
  const [saving,setSaving] = useState(false);
  const [retryVersion,setRetryVersion] = useState(0);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    periodRepository.load().then(value => { if(active) { current.current=value; setData(value); setReady(true); setError(''); } })
      .catch(() => { if(active) setError('记录读取失败，请重试。'); });
    return () => { active=false; };
  },[retryVersion]);
  function update(change: (value: PeriodData) => PeriodData) {
    if(!ready) return;
    const value = change(current.current);
    current.current=value; setData(value); setSaving(true);
    queue.current = queue.current.catch(() => {}).then(async() => {
      try { await periodRepository.save(value); if(current.current===value) { setError(''); setSaving(false); } }
      catch { setError('保存失败，当前更改尚未保存，请重试。'); setSaving(false); }
    });
  }
  const retry = () => ready ? update(value => ({...value})) : setRetryVersion(value => value+1);
  return { data, ready, error, saving, update, retry };
}
