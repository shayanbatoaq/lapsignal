export interface CatalogValue { id: number; name: string; slug: string }

const catalog = (names: Record<number, string>, prefix: string, id: number): CatalogValue => {
  const name = names[id];
  return name
    ? { id, name, slug: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/(^-|-$)/g, "") }
    : { id, name: `Unknown ${prefix} · ID ${id}`, slug: `unknown-${prefix}-${id}` };
};

export const TRACKS: Record<number, string> = {
  0:"Melbourne",1:"Paul Ricard",2:"Shanghai",3:"Sakhir",4:"Catalunya",5:"Monaco",6:"Montreal",7:"Silverstone",8:"Hockenheim",9:"Hungaroring",10:"Spa-Francorchamps",11:"Monza",12:"Singapore",13:"Suzuka",14:"Abu Dhabi",15:"Circuit of the Americas",16:"Interlagos",17:"Red Bull Ring",18:"Sochi",19:"Mexico City",20:"Baku",21:"Sakhir Short",22:"Silverstone Short",23:"COTA Short",24:"Suzuka Short",25:"Hanoi",26:"Zandvoort",27:"Imola",28:"Portimão",29:"Jeddah"
};
export const TEAMS: Record<number, string> = {
  0:"Mercedes",1:"Ferrari",2:"Red Bull Racing",3:"Williams",4:"Aston Martin",5:"Alpine",6:"AlphaTauri",7:"Haas",8:"McLaren",9:"Alfa Romeo",42:"Art GP '19",43:"Campos '19",44:"Carlin '19",45:"Sauber Junior Charouz '19",46:"Dams '19",47:"Uni-Virtuosi '19",48:"MP Motorsport '19",49:"Prema '19",50:"Trident '19",51:"Arden '19",85:"Mercedes 2020",86:"Ferrari 2020",87:"Red Bull 2020",88:"Williams 2020",89:"Racing Point 2020",90:"Renault 2020",91:"AlphaTauri 2020",92:"Haas 2020",93:"McLaren 2020",94:"Alfa Romeo 2020"
};
export const SESSION_TYPES: Record<number, string> = {0:"Unknown",1:"Practice 1",2:"Practice 2",3:"Practice 3",4:"Short Practice",5:"Qualifying 1",6:"Qualifying 2",7:"Qualifying 3",8:"Short Qualifying",9:"One-shot Qualifying",10:"Race",11:"Race 2",12:"Race 3",13:"Time Trial"};
export const FORMULAS: Record<number, string> = {0:"F1 Modern",1:"F1 Classic",2:"F2",3:"Formula Generic"};
export const WEATHER: Record<number, string> = {0:"Clear",1:"Light cloud",2:"Overcast",3:"Light rain",4:"Heavy rain",5:"Storm"};

export function trackValue(id: number): CatalogValue { return catalog(TRACKS, "track", id); }
export function teamValue(id: number): CatalogValue { return catalog(TEAMS, "team", id); }
export function sessionTypeValue(id: number): CatalogValue { return catalog(SESSION_TYPES, "session type", id); }
export function formulaValue(id: number): CatalogValue { return catalog(FORMULAS, "formula", id); }
export function weatherValue(id: number): CatalogValue { return catalog(WEATHER, "weather", id); }

export function assistValue(value: number): string {
  return ({ 0:"Off", 1:"On" } as Record<number,string>)[value] ?? `Unknown · ID ${value}`;
}
export function gearboxAssistValue(value: number): string {
  return ({ 1:"Manual", 2:"Manual with suggested gear", 3:"Automatic" } as Record<number,string>)[value] ?? `Unknown · ID ${value}`;
}
export function racingLineValue(value: number): string {
  return ({ 0:"Off", 1:"Corners only", 2:"Full" } as Record<number,string>)[value] ?? `Unknown · ID ${value}`;
}
