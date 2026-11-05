import { boot } from './boot';
import sky from './layers/sky';
import space from './layers/space';
import land from './layers/land';
import water from './layers/water';
import dock from './layers/dock';
import fisher from './layers/fisher';
import weather from './layers/weather';
import lantern from './layers/lantern';

boot([sky, space, land, water, dock, fisher, lantern, weather]);
