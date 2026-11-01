type Preparation = {
  requiresCarvoaria: boolean;
  serviceTimerMinutes: number | null;
  assetTrackingTotal: number | null;
  requiresKitchen: boolean;
  requiresBar: boolean;
  barStation?: string;
  preparationIngredients: string;
};

export function ProductPreparationFields({
  value,
  onChange,
  carvoariaEnabled = false,
}: {
  value: Preparation;
  onChange: (value: Preparation) => void;
  carvoariaEnabled?: boolean;
}) {
  return (
    <fieldset className="my-4 rounded-xl border border-orange-500/25 bg-orange-500/5 p-4 space-y-3">
      <legend className="px-2 text-sm font-bold text-orange-300">
        Preparo e atendimento
      </legend>
      <p className="text-xs text-zinc-400">
        Ao lançar na comanda, enviar automaticamente para:
      </p>
      <div className="flex flex-wrap gap-5 text-sm text-white">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.requiresKitchen}
            onChange={(e) =>
              onChange({
                ...value,
                requiresKitchen: e.target.checked,
                requiresBar: false,
                requiresCarvoaria: false, serviceTimerMinutes: null, assetTrackingTotal: null,
              })
            }
          />{' '}
          Cozinha
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.requiresBar}
            onChange={(e) =>
              onChange({
                ...value,
                requiresBar: e.target.checked,
                requiresKitchen: false,
                requiresCarvoaria: false, serviceTimerMinutes: null, assetTrackingTotal: null,
              })
            }
          />{' '}
          Bar
        </label>
        {carvoariaEnabled && <label className="flex items-center gap-2">
          <input type="checkbox" checked={value.requiresCarvoaria} onChange={e => onChange({ ...value,
            requiresCarvoaria: e.target.checked, requiresKitchen: false, requiresBar: false,
            serviceTimerMinutes: e.target.checked ? 30 : null, assetTrackingTotal: null })} /> Carvoaria / Narguile
        </label>}
      </div>
      {value.requiresBar && <label className="block text-sm text-zinc-300">Estação do bar
        <select value={value.barStation || 'BAR'} onChange={e => onChange({ ...value, barStation: e.target.value })} className="ml-3 rounded-lg bg-zinc-950 p-2">
          <option value="BAR">Bar (existente)</option><option value="BAR_1">Bar 1</option><option value="BAR_2">Bar 2</option>
        </select>
      </label>}
      {value.requiresCarvoaria && <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-300">Ronda (minutos; vazio = sem alerta)
          <input type="number" min={1} max={1440} value={value.serviceTimerMinutes ?? ''}
            onChange={e => onChange({ ...value, serviceTimerMinutes: e.target.value === '' ? null : Number(e.target.value) })}
            className="mt-2 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-3" />
        </label>
        <label className="text-xs text-zinc-300">Equipamentos numerados (vazio = sem rastreamento)
          <input type="number" min={1} max={500} value={value.assetTrackingTotal ?? ''}
            onChange={e => onChange({ ...value, assetTrackingTotal: e.target.value === '' ? null : Number(e.target.value) })}
            className="mt-2 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-3" />
        </label>
        <p className="text-xs text-zinc-400 sm:col-span-2">O número identifica o mesmo equipamento em toda a loja. A ronda começa na entrega e não altera a cobrança.</p>
      </div>}
      {(value.requiresKitchen || value.requiresBar || value.requiresCarvoaria) && (
        <label className="block text-xs text-zinc-300">
          Ingredientes (opcional)
          <textarea
            maxLength={5000}
            rows={3}
            value={value.preparationIngredients}
            onChange={(e) =>
              onChange({ ...value, preparationIngredients: e.target.value })
            }
            placeholder="Ex.: massa, queijo, tomate e manjericão"
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-white"
          />
          <span className="block text-zinc-500">
            Descrição da receita. Para baixa de ingredientes no estoque, use a
            composição do produto.
          </span>
        </label>
      )}
    </fieldset>
  );
}
