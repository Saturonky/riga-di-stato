// Righe aggiunte e rimosse: una stima dagli input di Edit e Write andati a buon fine.
// Osservatori puri: il `.catch` lascia passare la chiamata, di proposito.
import type { On } from '../effetti.ts'
import { aggiungiModifiche } from '../stato.ts'
import { righeDi } from '../stime.ts'

export function registraModifiche(on: On): void {
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await aggiungiModifiche($, righeDi(e.new_string), righeDi(e.old_string))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true) {
      await aggiungiModifiche($, righeDi(e.content), 0)
    }
    return ran
  }).catch(($, e, next) => next(e))
}
