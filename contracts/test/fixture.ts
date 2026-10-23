// Маленький выдуманный мир для тестов контракта. Не реальные проекты и не замена генератору.
import type { Snapshot } from '../src/model.ts';

export function fixture(): Snapshot {
  return {
    schema: 1,
    revision: 3,
    entities: [
      { id: 'project:sill-greenhouse', visibility: 'published', title: { ru: 'Теплица на подоконнике', en: 'Windowsill greenhouse' },
        summary: { ru: 'Полив по влажности почвы' }, started: '2025-03', question: 'update:2025-03-02-why-plants-die', tags: ['sensors'] },
      { id: 'project:rooftop-weather', visibility: 'published', title: { en: 'Rooftop weather node' }, started: '2025-06-10' },
      { id: 'project:secret-draft', visibility: 'draft', title: { ru: 'Черновик' } },
      { id: 'update:2025-03-02-why-plants-die', visibility: 'published', date: '2025-03-02', project: 'project:sill-greenhouse',
        type: 'question', title: { ru: 'Почему базилик дохнет через неделю?' } },
      { id: 'update:2025-03-20-capacitive', visibility: 'published', date: '2025-03-20', project: 'project:sill-greenhouse',
        type: 'decision', status: 'active', title: { ru: 'Ёмкостный датчик вместо резистивного' } },
      { id: 'update:2025-05-resistive-rot', visibility: 'published', date: '2025-05', project: 'project:sill-greenhouse',
        type: 'deadend', title: { en: 'Resistive probe corroded in two weeks' } },
      { id: 'update:2025-07-01-pause', visibility: 'published', date: '2025-07-01', project: 'project:sill-greenhouse',
        type: 'note', status: 'paused', title: { ru: 'Лето, растения на балконе, проект на паузе' } },
      { id: 'update:2025-07-14-how-cheap', visibility: 'published', date: '2025-07-14', project: 'project:rooftop-weather',
        type: 'question', title: { en: 'How cheap can a pressure sensor get before it lies?' } },
      { id: 'update:2025-06-moved', visibility: 'published', date: '2025-06', type: 'note', title: { ru: 'Переезд на последний этаж' } },
      { id: 'update:2025-04-draft-thing', visibility: 'published', date: '2025-04-01', project: 'project:secret-draft', type: 'note', title: { ru: 'скрыто вместе с проектом' } },
      { id: 'research:probe-corrosion', visibility: 'published', project: 'project:sill-greenhouse', date: '2025-04',
        question: { ru: 'Сколько живёт резистивный щуп в мокрой земле?' }, conclusion: { ru: 'Две недели.' } },
      { id: 'artifact:probe-photo', visibility: 'published', ref: 'media/probe-after-14-days.jpg', mime: 'image/jpeg',
        project: 'project:sill-greenhouse', research: 'research:probe-corrosion', date: '2025-05' },
      { id: 'artifact:rain-loop', visibility: 'published', ref: 'https://example.org/tracks/rain-loop', title: { en: 'Rain loop' } },
      { id: 'chapter:one', visibility: 'published', number: 1, title: { ru: 'Базилик' }, summary: { ru: 'Неделя, за которую умер базилик' }, date: '2025-03', pages: [
        { image: 'manga/one/p1.webp', panels: [
          { region: { x: 0, y: 0, w: 1, h: 0.5 }, animation: 'manga/one/p1-c1.webm', hotspots: [
            { icon: 'leaf', target: 'project:sill-greenhouse' },
            { icon: 'music', target: 'artifact:rain-loop' },
            { icon: 'lock', target: 'project:secret-draft' },
          ] },
          { region: { x: 0, y: 0.5, w: 1, h: 0.5 }, text: { ru: '— Опять засох.', en: '— Dead again.' }, hotspots: [{ icon: 'link', target: 'https://example.org/basil' }] },
        ] },
      ] },
      { id: 'chapter:two', visibility: 'published', number: 2, title: { ru: 'Крыша' }, pages: [{ panels: [{ image: 'manga/two/c1.webp' }] }] },
    ],
    relations: [
      { from: 'update:2025-03-20-capacitive', type: 'caused_by', to: 'update:2025-05-resistive-rot' },
      { from: 'research:probe-corrosion', type: 'answers', to: 'update:2025-03-02-why-plants-die' },
      { from: 'project:rooftop-weather', type: 'derived_from', to: 'project:sill-greenhouse' },
      { from: 'update:2025-06-moved', type: 'unlocks', to: 'project:rooftop-weather' },
      { from: 'project:sill-greenhouse', type: 'relates_to', to: 'project:secret-draft' },
    ],
  };
}
