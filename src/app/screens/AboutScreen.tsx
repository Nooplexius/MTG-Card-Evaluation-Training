import { TapLink } from '../ui/Tap.tsx';
import { useApp } from '../AppContext.tsx';
import { ScreenHead } from './ScreenHead.tsx';

export function AboutScreen() {
  const { manifest } = useApp();
  return (
    <div className="screen prose">
      <ScreenHead title="About & glossary" />
      <section>
        <h2>What Loupe trains</h2>
        <p>
          Loupe shows you a card from a current Limited format, you grade it on 17Lands' 13-step scale, and it shows you how the card actually performed. The skill that matters most is your <b>first look</b>: how close you get on a card you have never seen graded. That is the skill that carries over to a brand-new set. Loupe also tracks what you remember about cards you have seen before, which pays off when you draft today's formats.
        </p>
      </section>
      <section>
        <h2>The numbers</h2>
        <dl className="glossary">
          <dt>GIH WR (games in hand win rate)</dt>
          <dd>
            The win rate of games where the card was in your opening hand or drawn at some point. It is the most popular single measure of a card's strength in a format because it only counts games where the card could have mattered.
          </dd>
          <dt>Grade</dt>
          <dd>
            17Lands' letter grades place each card's GIH WR against all graded cards in the same set and format: C covers the middle third of a standard deviation, and every step up or down (one "step", such as B to B+) is another third. Three steps make a letter grade. Grades are relative to a format, so a B in one set is not the same win rate as a B in another, and color or rarity filters never change them.
          </dd>
          <dt>OH WR and GD WR</dt>
          <dd>Win rate when the card was in the opening hand, and when it was drawn later. Cards that are better early (cheap, proactive) show a higher OH WR; cards that are better late (expensive, situational) can show the reverse.</dd>
          <dt>IIH (improvement when in hand)</dt>
          <dd>GIH WR minus the win rate of games where the card was in the deck but never drawn. It estimates how much drawing the card helped compared to not drawing it.</dd>
          <dt>ALSA and ATA</dt>
          <dd>Average last seen at (the latest pick a card was still available) and average taken at (the pick it was taken). Lower means drafters value it more. Comparing pick order with win rate shows where drafters misjudge cards: the crowd gap.</dd>
          <dt>Steps and noise</dt>
          <dd>
            Win rates are measured on a finite number of games. A rare with 500 games in hand can be a step and a half off its true grade by chance alone; a common with 30,000 games is within a fifth of a step. Loupe shows this noise on reveals and counts an answer within one step as correct for streaks and scheduling.
          </dd>
        </dl>
      </section>
      <section>
        <h2>What GIH WR does not capture</h2>
        <ul>
          <li>Deck quality: cards that only go into strong decks (or only weak ones) inherit those decks' win rates.</li>
          <li>Game length: cards that are good in long games get more chances to be drawn, which nudges their numbers.</li>
          <li>Color strength: every card in the format's best color looks a little better than it is, and the weakest color's cards a little worse. Loupe shows how each card's color did on the reveal.</li>
        </ul>
        <p>
          17Lands explains these effects in{' '}
          <TapLink href="https://blog.17lands.com/posts/using-win-rate-data/">Using Win Rate Data</TapLink>.
        </p>
      </section>
      <section>
        <h2>Credits</h2>
        <ul className="credits">
          <li>
            Win-rate data from <TapLink href="https://www.17lands.com/card_data">17Lands Card Data</TapLink>
            {manifest?.sets.length ? (
              <>
                {' '}
                for{' '}
                {manifest.sets.map((s, i) => (
                  <span key={s.code}>
                    {i > 0 ? ', ' : ''}
                    <TapLink href={s.cardDataUrl}>{s.code}</TapLink>
                  </span>
                ))}
              </>
            ) : null}
            . 17Lands does not endorse Loupe.
          </li>
          <li>
            Card lists for joining come from 17Lands' public datasets (<TapLink href="https://www.17lands.com/public_datasets">cards.csv</TapLink>), licensed under{' '}
            <TapLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</TapLink>.
          </li>
          <li>
            Card data, images and mana symbols from <TapLink href="https://scryfall.com">Scryfall</TapLink>. Scryfall does not endorse Loupe.
          </li>
          <li>Fonts: Alegreya and Alegreya Sans by Juan Pablo del Peral (Huerta Tipográfica), SIL Open Font License.</li>
        </ul>
        <p className="fan-notice">
          Loupe is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
        </p>
        <p className="fine">Loupe is free, has no ads and no trackers. Your progress stays on this device.</p>
      </section>
    </div>
  );
}
