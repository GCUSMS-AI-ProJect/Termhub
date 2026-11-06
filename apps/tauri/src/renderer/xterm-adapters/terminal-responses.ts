export function readHydrationControlSequence(data: string, start: number, escape: string) {
  const csiPrefix = `${escape}[`
  if (data.startsWith(csiPrefix, start)) {
    for (let index = start + csiPrefix.length; index < data.length; index += 1) {
      const code = data.charCodeAt(index)
      if (code >= 0x40 && code <= 0x7e) {
        return data.slice(start, index + 1)
      }
    }
    return null
  }

  const oscPrefix = `${escape}]`
  const dcsPrefix = `${escape}P`
  const isOsc = data.startsWith(oscPrefix, start)
  const isDcs = data.startsWith(dcsPrefix, start)
  if (!isOsc && !isDcs) {
    return null
  }

  const stringStart = start + 2
  const bell = String.fromCharCode(7)
  const stringTerminator = `${escape}\\`
  const bellIndex = isOsc ? data.indexOf(bell, stringStart) : -1
  const stringTerminatorIndex = data.indexOf(stringTerminator, stringStart)
  let end = -1
  if (bellIndex >= 0 && stringTerminatorIndex >= 0) {
    end = Math.min(bellIndex + bell.length, stringTerminatorIndex + stringTerminator.length)
  } else if (bellIndex >= 0) {
    end = bellIndex + bell.length
  } else if (stringTerminatorIndex >= 0) {
    end = stringTerminatorIndex + stringTerminator.length
  }
  return end >= 0 ? data.slice(start, end) : null
}

export function isTerminalResponseSequence(sequence: string, escape: string) {
  // xterm emits these sequences as answers to terminal queries (CPR/DA/mode/
  // color/window reports). The same classifier is used for two different
  // boundaries: discard synthetic answers produced while replaying history,
  // but allow a real response through while a newly spawned PTY is still
  // connecting.
  const csiPrefix = `${escape}[`
  if (sequence.startsWith(csiPrefix)) {
    const csi = sequence.slice(csiPrefix.length)
    if (csi === '0n') return true
    if (/^\??\d+(?:;\d+)*R$/.test(csi)) return true
    if (/^(?:\?|>)[\d;]*c$/.test(csi)) return true
    if (/^(?:4|6|8);\d+(?:;\d+)?t$/.test(csi)) return true
    if (/^(?:\?)?\d+(?:;\d+)*\$y$/.test(csi)) return true
  }

  const oscPrefix = `${escape}]`
  if (sequence.startsWith(oscPrefix)) {
    const osc = sequence.slice(oscPrefix.length)
    const stringTerminator = `${escape}\\`
    const body = osc.endsWith(String.fromCharCode(7))
      ? osc.slice(0, -1)
      : osc.endsWith(stringTerminator)
        ? osc.slice(0, -stringTerminator.length)
        : null
    if (body !== null && /^(?:4;\d+|10|11|12);rgb:[0-9a-f]+(?:\/[0-9a-f]+){2}$/i.test(body)) {
      return true
    }
  }

  const dcsPrefix = `${escape}P`
  const dcsTerminator = `${escape}\\`
  if (sequence.startsWith(dcsPrefix) && sequence.endsWith(dcsTerminator)) {
    const dcs = sequence.slice(dcsPrefix.length, -dcsTerminator.length)
    return /^[01]\$r[\s\S]*$/.test(dcs)
  }

  return false
}

export function isHydrationResponseSequence(sequence: string, escape: string) {
  // A transcript is a recording of PTY output, not a live terminal state.
  // When it is replayed after a tab switch, xterm can answer historical
  // terminal queries. Forwarding those synthetic answers to the now-idle
  // shell makes it echo fragments such as `;201R` or `2RR0;276;0c`.
  return isTerminalResponseSequence(sequence, escape)
}

export function stripHydratedTerminalResponses(data: string) {
  const escape = String.fromCharCode(27)
  let result = ''
  let removedResponse = false
  let index = 0

  while (index < data.length) {
    if (data[index] !== escape) {
      result += data[index]
      index += 1
      continue
    }

    const sequence = readHydrationControlSequence(data, index, escape)
    if (sequence && isHydrationResponseSequence(sequence, escape)) {
      removedResponse = true
      index += sequence.length
      continue
    }

    result += data[index]
    index += 1
  }

  return removedResponse ? result : data
}
