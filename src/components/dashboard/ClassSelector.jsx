
import React, { useState } from 'react';
import { FancyCard, Button, Input, clsx } from '../ui';

export function ClassSelector({
  classes,
  onSelectClass,
  onCreateClass,
  onDeleteClass,
  onToggleActiveClass,
  onShowCode,
}) {
  const [teacherName, setTeacherName] = useState('Profesor/a');
  const [name, setName] = useState('Mi clase');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreateClass({ name, teacherName });
    } catch (e) {
      // Error is handled by the parent component's toast
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <Input label="Nombre de la clase" value={name} setValue={setName} />
        <Input label="Nombre profesor" value={teacherName} setValue={setTeacherName} />
        <Button onClick={handleCreate} variant="primary" disabled={creating}>
          {creating ? 'Creando...' : 'Crear clase'}
        </Button>
      </div>

      <FancyCard>
        <h3 className="font-bold mb-2">Clases</h3>
        <div className="flex flex-col gap-2">
          {classes.length === 0 ? (
            <p className="text-sm text-slate-600">No hay clases. Crea una.</p>
          ) : (
            classes.map((c) => (
              <div
                key={c.code || c.id}
                className={clsx(
                  'p-2 rounded-lg border flex items-center justify-between',
                  'border-slate-200',
                  c.active === false ? 'opacity-60 bg-slate-50' : ''
                )}
              >
                <button
                  className="text-left flex-1 min-w-0"
                  onClick={() => c.active !== false && onSelectClass(c.code || c.id)}
                  aria-label={`Seleccionar clase ${c.name}`}
                >
                  <div>
                    <div className="font-semibold truncate">
                      {c.name}{' '}
                      {c.active === false && (
                        <span className="text-xs font-medium text-red-600 ml-2">(Desactivada)</span>
                      )}
                    </div>
                    <div className="text-xs opacity-60 truncate">
                      {c.code || c.id} {c.passwordHash ? '🔒' : ''}{' '}
                      <span className="opacity-70">· {c.teacherName}</span>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  <button
                    title="Activar/Desactivar"
                    onClick={() => onToggleActiveClass(c.code || c.id)}
                    className="text-sm px-2 py-1 rounded bg-slate-100"
                  >
                    {c.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    title="Mostrar código"
                    onClick={() => onShowCode(c.code || c.id)}
                    className="text-sm px-2 py-1 rounded bg-slate-100"
                  >
                    Código
                  </button>
                  <button
                    title="Borrar"
                    onClick={() => onDeleteClass(c.code || c.id)}
                    className="text-sm px-2 py-1 rounded bg-red-100 text-red-700"
                  >
                    X
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </FancyCard>
    </div>
  );
}
