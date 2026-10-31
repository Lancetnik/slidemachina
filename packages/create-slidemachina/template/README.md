# Мой доклад

Презентация на slidemachina. Слайды в `index.tsx`, тема в `style.css`, картинки в `images/`.

## Команды

```bash
npm install
npm run dev      # открыть в браузере, правки видны сразу
npm run build    # собрать: спросит, что именно
npm run check    # проверить слайды по правилам понятного доклада
npx slidemachina shot 5   # снимок слайда 5 в slide-5.png
```

Агенту хватит `AGENTS.md` рядом: там команды и правила подачи, а Claude Code возьмёт ещё скилл из `.claude/skills/slidemachina`.

Без вопросов, например в CI:

```bash
npx slidemachina build --html        # один HTML-файл, картинки и шрифты внутри
npx slidemachina build --protected   # один файл под паролем из SLIDEMACHINA_PASSWORD
npx slidemachina build --folder      # папка для сайта, --zip — она же в архиве
npx slidemachina build --pdf         # PDF, страница на слайд; с --steps — на каждый шаг
npx slidemachina build --pptx        # PowerPoint: текст и схемы можно править, шаги — анимация
npx slidemachina build --hyperframes # HyperFrames: кадры слайдов и шагов для видео
```

Результат появится в `dist/`. Другую папку задают флагом `--out`.

## Слайды

Компоненты берутся одним импортом: `import * as Machina from "slidemachina"`. Дальше `<Machina.Slide>`, `<Machina.Image>` и так далее, в таблице ниже приставка опущена.

```tsx
<Machina.Presentation lang="ru" logo={{ light: logo, dark: logoOnDark }}>
  <Machina.Slide cover>
    <h1>Мой доклад</h1>
  </Machina.Slide>
  <Machina.Section title="Начало">
    <Machina.Slide>
      <h2>Заголовок</h2>
      <p>Обычный текст</p>
    </Machina.Slide>
  </Machina.Section>
</Machina.Presentation>
```

- Заголовок вкладки и списка презентаций — `h1` первой обложки. Нужен другой — `title` у `Presentation`.
- `Section` — раздел. Из разделов получаются обложки, хлебные крошки и группы в обзоре слайдов. Свой `<Machina.Slide cover>` первым в разделе заменяет обложку с номером. Его `h1` — название раздела, если нет `title`. `cover={false}` убирает обложку раздела.
- `Slide`: `cover` — обложка, `align` — `left`, `center` или `right`, `valign` — `top`, `center` или `bottom`, `background="#14161d"` или картинка, `plain` — без логотипа, крошек и номера, `transition` — свой переход.
- Переходы: `auto`, `morph`, `slide`, `fade`, `zoom`, `cube`, `flip`, `wipe`, `iris`, `blinds`, `mosaic`, `glitch`, `none`. По умолчанию `auto`: если на соседних слайдах есть общие элементы, они перетекают, если нет — слайд сдвигается.
- Скорость переходов и шагов — `speed` у `Presentation` или `Slide`: `fast`, `normal` (по умолчанию), `slow` или число. `speed={2}` — вдвое быстрее.
- Формат слайдов — `aspectRatio` у `Presentation`: `"16:9"` (по умолчанию), `"4:3"`, `"16:10"`, `"9:16"` или любая пара чисел. Формат один на всю презентацию. В нём обзор слайдов, PDF и PowerPoint. На экране слайд растёт под окно, но не больше чем на треть: фон доходит до краёв, размер шрифта не меняется. Дальше по краям поля цвета слайда.

## Блоки

| Блок | Пример |
| --- | --- |
| Список по шагам | `<ul data-steps><li>Первый</li><li>Второй</li></ul>`. `data-steps={3}` — с третьего шага |
| Шаг на любом месте | `<span data-step data-step-effect="highlight">вот так</span>`, эффекты `rise`, `fade`, `scale`, `glitch`, `highlight`, `dim`; для всех шагов — `<Presentation stepEffect="glitch">` |
| Код | `<Code lang="ts">{"const answer = 42;"}</Code>` или `<Code src="./app.py" lines="2-4 \| 8" numbers />` — строки по шагам, `numbers` — номера строк |
| Картинка | `<Image src={photo} stretch />` — на свободное место, `full` — на весь слайд. `float="left"` или `"right"` — текст обтекает картинку. На обложке `<Image>` перед текстом стоит слева от него, после — справа |
| Видео | `<Video src={clip} poster={still} stretch />` — играет без звука, пока слайд на экране |
| Колонки | `<div className="machina-columns"><div>…</div><div>…</div></div>` — каждая колонка в своём `<div>`. Ширины: `style={{ gridTemplateColumns: "1fr 2fr" }}` |
| Таблица | `<table data-steps><thead>…</thead><tbody>…</tbody></table>` — строки по шагам |
| Сравнение | `<table className="machina-compare">` — критерии слева, два–четыре решения справа. Отметки: `<td className="machina-yes" />` и `<td className="machina-no" />` |
| Цитата | `<figure><blockquote>Текст</blockquote><figcaption>Автор</figcaption></figure>` |
| Большое число | `<figure className="machina-big-number"><p>42</p><figcaption>подпись</figcaption></figure>` |
| Текст | `<p className="machina-lead">` — вводная фраза, под заголовком слайда — подзаголовок, `<p>` — основной текст, `<p className="machina-note">` — примечание мелким шрифтом |
| Подпись и источник | `<figcaption>…</figcaption>` сразу после блока, `<p className="machina-source">…</p>` — сноска с линией |
| QR-код | `<QR value="https://…" logo={logo} />` — на свободное место, фон прозрачный. В колонках ставьте код слева |
| Мем | `<Meme src={picture}><p>Верх</p><p>Низ</p></Meme>` — подписи поверх картинки: первая сверху, вторая снизу. `data-place` у подписи двигает её, `float` ставит мем сбоку от текста |
| Тезис | `<Slide background="var(--accent-color)"><p className="machina-thesis">Одна мысль</p></Slide>` — фраза в центре слайда. Помельче — `machina-thesis-small` |
| Блок поверх слайда | `<div className="machina-pin-bottom machina-pin-right">…</div>` — блок прижат к краю слайда и не двигает остальное |
| Схема | `<Diagram><Box id="a">A</Box><Box id="b">B</Box><Arrow from="a" to="b" /></Diagram>` |
| Sequence-диаграмма | `<Sequence><Actor id="a">A</Actor><Actor id="b">B</Actor><Message from="a" to="b" label="запрос" /></Sequence>` |
| 3D-сцена | `<Scene orbit><Cube size={1.5} /><Sphere position={[2, 0.5, 0]} step /></Scene>` |

Мем проще вставить с панели в `npm run dev`, кнопка со смайликом:
- поиск шаблонов и GIF, вставка по ссылке;
- мем встаёт на новый слайд после текущего, под ним — источник.

Из терминала то же делает `npx slidemachina meme "запрос"`. Для GIF нужен бесплатный ключ GIPHY в `SLIDEMACHINA_GIPHY_KEY`.

Два элемента на соседних слайдах перетекают друг в друга, если у них одинаковый текст или `morph="имя"`.

## Клавиши

| Клавиша | Что делает |
| --- | --- |
| → , пробел, PageDown | дальше |
| ← , PageUp | назад |
| Esc или O | все слайды |
| номер и Enter | перейти к слайду |
| B | пауза: чёрный экран, вернуться — B или кнопка |
| F | полный экран |
| H | спрятать панель |
| E | редактор: текст, картинки и слайды правятся прямо на слайде, только в `npm run dev` |
| M | мини-карта слайдов справа, только в `npm run dev` |
| Cmd+P или Ctrl+P | печать в PDF |

На телефоне и планшете листает свайп или касание: справа — дальше, слева — назад.

## Тема

Тема — CSS-переменные в `style.css`. Главные уже выписаны в комментарии: раскомментируйте строку и поменяйте значение.

```css
:root {
  --accent-color: #e8574c;
  --section-background: #1c2030;
}
```

Классы Tailwind работают прямо в `index.tsx`: `className="text-(--muted-color)"`.
