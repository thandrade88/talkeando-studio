import { describe, it, expect, vi } from 'vitest'

vi.mock('electron')
vi.mock('better-sqlite3')
vi.mock('ffmpeg-static', () => ({ default: '/usr/bin/ffmpeg' }))

import { parseWhisperOutput, timeToSeconds, mergeChunkSegments } from '../../electron/services/transcriptEngine'

describe('timeToSeconds', () => {
  it('converts zero timestamp', () => {
    expect(timeToSeconds('00:00:00.000')).toBe(0)
  })

  it('converts seconds only', () => {
    expect(timeToSeconds('00:00:05.500')).toBeCloseTo(5.5)
  })

  it('converts minutes and seconds', () => {
    expect(timeToSeconds('00:01:30.250')).toBeCloseTo(90.25)
  })

  it('converts hours, minutes, seconds', () => {
    expect(timeToSeconds('01:02:03.456')).toBeCloseTo(3723.456)
  })

  it('handles milliseconds correctly', () => {
    expect(timeToSeconds('00:00:00.001')).toBeCloseTo(0.001)
  })
})

describe('parseWhisperOutput', () => {
  it('returns empty array for empty string', () => {
    expect(parseWhisperOutput('')).toEqual([])
  })

  it('returns empty array for non-matching output', () => {
    expect(parseWhisperOutput('no timestamps here\njust some text')).toEqual([])
  })

  it('parses a single segment', () => {
    const output = '[00:00:00.000 --> 00:00:05.500]  Hello world'
    const result = parseWhisperOutput(output)

    expect(result).toHaveLength(1)
    expect(result[0].start_time).toBeCloseTo(0)
    expect(result[0].end_time).toBeCloseTo(5.5)
    expect(result[0].text).toBe('Hello world')
  })

  it('parses multiple segments', () => {
    const output = [
      '[00:00:00.000 --> 00:00:03.000]  First segment',
      '[00:00:03.000 --> 00:00:07.500]  Second segment',
      '[00:00:07.500 --> 00:01:00.000]  Third segment',
    ].join('\n')

    const result = parseWhisperOutput(output)

    expect(result).toHaveLength(3)
    expect(result[0].text).toBe('First segment')
    expect(result[1].start_time).toBeCloseTo(3)
    expect(result[2].end_time).toBeCloseTo(60)
  })

  it('trims whitespace from segment text', () => {
    const output = '[00:00:00.000 --> 00:00:02.000]    lots of spaces   '
    const result = parseWhisperOutput(output)

    expect(result[0].text).toBe('lots of spaces')
  })

  it('parses real-world whisper output with speaker tags', () => {
    const output = `
whisper_print_timings: load time = 123.45 ms
[00:00:00.000 --> 00:00:04.320]  Olá, bem-vindos ao Talkeando.
[00:00:04.320 --> 00:00:08.640]  Hoje vamos falar sobre tecnologia.
whisper_print_timings: total time = 456.78 ms
    `.trim()

    const result = parseWhisperOutput(output)

    expect(result).toHaveLength(2)
    expect(result[0].text).toBe('Olá, bem-vindos ao Talkeando.')
    expect(result[1].text).toBe('Hoje vamos falar sobre tecnologia.')
  })

  it('ignores lines that do not match the timestamp pattern', () => {
    const output = [
      'whisper_init_from_file_no_state: loading model from ...',
      '[00:00:00.000 --> 00:00:02.000]  Valid segment',
      'whisper_print_timings: encode time =  0.00 ms',
    ].join('\n')

    expect(parseWhisperOutput(output)).toHaveLength(1)
  })

  it('filters out non-speech annotation tokens', () => {
    const output = [
      '[00:00:00.000 --> 00:00:03.000]  [música de fundo]',
      '[00:00:03.000 --> 00:00:06.000]  Olá, bem-vindos ao podcast.',
      '[00:00:06.000 --> 00:00:09.000]  [Music]',
      '[00:00:09.000 --> 00:00:12.000]  (music)',
      '[00:00:12.000 --> 00:00:15.000]  [Applause]',
      '[00:00:15.000 --> 00:00:18.000]  Hoje vamos falar sobre IA.',
    ].join('\n')

    const result = parseWhisperOutput(output)

    expect(result).toHaveLength(2)
    expect(result[0].text).toBe('Olá, bem-vindos ao podcast.')
    expect(result[1].text).toBe('Hoje vamos falar sobre IA.')
  })

  it('keeps segments that mix speech with annotation markers', () => {
    const output = '[00:00:00.000 --> 00:00:05.000]  [música] Olá a todos'
    const result = parseWhisperOutput(output)
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('[música] Olá a todos')
  })
})

describe('mergeChunkSegments', () => {
  it('returns empty array for no chunks', () => {
    expect(mergeChunkSegments([])).toEqual([])
  })

  it('returns segments as-is for a single chunk', () => {
    const segments = [
      { start_time: 0, end_time: 5, text: 'Hello' },
      { start_time: 5, end_time: 10, text: 'World' },
    ]
    expect(mergeChunkSegments([{ offsetSeconds: 0, segments }])).toEqual(segments)
  })

  it('drops segments from later chunks that fall within the overlap window', () => {
    const chunk1 = {
      offsetSeconds: 0,
      segments: [
        { start_time: 0, end_time: 150, text: 'First half' },
        { start_time: 150, end_time: 305, text: 'Crosses into overlap' },
      ],
    }
    const chunk2 = {
      offsetSeconds: 300,
      segments: [
        { start_time: 302, end_time: 308, text: 'Duplicate in overlap' },
        { start_time: 310, end_time: 450, text: 'New content' },
        { start_time: 450, end_time: 600, text: 'More content' },
      ],
    }
    const merged = mergeChunkSegments([chunk1, chunk2])

    expect(merged).toHaveLength(4)
    expect(merged[0].text).toBe('First half')
    expect(merged[1].text).toBe('Crosses into overlap')
    expect(merged[2].text).toBe('New content')
    expect(merged[3].text).toBe('More content')
  })

  it('sorts final segments by start_time', () => {
    const chunk1 = {
      offsetSeconds: 0,
      segments: [{ start_time: 50, end_time: 100, text: 'B' }],
    }
    const chunk2 = {
      offsetSeconds: 300,
      segments: [{ start_time: 320, end_time: 400, text: 'C' }],
    }
    // Feed them out of order
    const merged = mergeChunkSegments([chunk2, chunk1])

    expect(merged[0].text).toBe('B')
    expect(merged[1].text).toBe('C')
  })

  it('keeps first chunk segments regardless of overlap boundary', () => {
    const chunk1 = {
      offsetSeconds: 0,
      segments: [
        { start_time: 0, end_time: 5, text: 'A' },
        { start_time: 5, end_time: 8, text: 'B' },
      ],
    }
    const merged = mergeChunkSegments([chunk1])
    expect(merged).toHaveLength(2)
  })

  it('handles three chunks with cascading overlaps', () => {
    const chunk1 = {
      offsetSeconds: 0,
      segments: [
        { start_time: 0, end_time: 290, text: 'Chunk 1' },
        { start_time: 290, end_time: 308, text: 'Chunk 1 tail' },
      ],
    }
    const chunk2 = {
      offsetSeconds: 300,
      segments: [
        { start_time: 303, end_time: 309, text: 'Overlap - should drop' },
        { start_time: 311, end_time: 590, text: 'Chunk 2 main' },
        { start_time: 590, end_time: 609, text: 'Chunk 2 tail' },
      ],
    }
    const chunk3 = {
      offsetSeconds: 600,
      segments: [
        { start_time: 605, end_time: 608, text: 'Overlap 2 - should drop' },
        { start_time: 615, end_time: 900, text: 'Chunk 3 main' },
      ],
    }
    const merged = mergeChunkSegments([chunk1, chunk2, chunk3])

    const texts = merged.map(s => s.text)
    expect(texts).toEqual([
      'Chunk 1', 'Chunk 1 tail',
      'Chunk 2 main', 'Chunk 2 tail',
      'Chunk 3 main',
    ])
  })
})
