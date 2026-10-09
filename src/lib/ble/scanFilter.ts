import { COMMAND_SERVICE, LARGE_SERVICE } from "./uuids";

/**
 * Name prefixes the vendor scanner accepts (`DeviceBindViewModel.filterResult`):
 * the hard-coded ones, the default server-configurable list from
 * `QCApplication`, and `sFILTER_PREFIX`. Matching is a plain `startsWith`, so
 * entries with a trailing space ("S ", "Capri ") only match that exact spelling.
 */
const BAND_NAME_PREFIXES = [
  // Hard-coded in the scanner callback.
  "O_",
  "o_",
  "Q_",
  "q_",
  "R3L",
  "QC",
  "qc",
  "Wa",
  // Default `QJavaApplication.getKeys()` list.
  "G69",
  "MS",
  "Ma",
  "Mi",
  "H5",
  "H1",
  "Ha",
  "HW",
  "Exo",
  "Evoke",
  "P4",
  "P5",
  "P6",
  "P7",
  "P8",
  "PBL",
  "S2",
  "S4",
  "S5",
  "S ",
  "ST",
  "SW",
  "SE",
  "AFTWS0423S",
  "iHunt",
  "T88",
  "Moi",
  "WT001",
  "N5",
  "E7",
  "GT",
  "FireBoltt 172",
  "FireBoltt 188",
  "FireBoltt 130",
  "FireBoltt 106",
  "FireBoltt 138",
  "EW11",
  "RSW007",
  "TS105",
  "Watch",
  "Y15",
  "Ul",
  "ul",
  "Unbound",
  "Duke",
  "Capri ",
  "TR",
  "i31",
  "GS9",
  "OG",
  "Go",
  "W2",
  "AHA",
  "AMD",
  "ADM",
  "LYCKA",
  "Laleli",
  "Ch",
  "TM05",
  "air",
  "Hello",
  "FT9 MINI",
  // `sFILTER_PREFIX`.
  "T80",
  "T90",
  "T91",
  "T93",
  "T95",
  "TW68",
  "S9",
  "C60",
  "C66",
  "C67",
  "C68",
  "C80",
  "C86",
  "C88",
  "C96",
  "wxb_w4",
];

const BAND_SERVICES = [COMMAND_SERVICE, LARGE_SERVICE];

/** True when a device looks like a QWatch-family band, by name or advertised service. */
export function isLikelyBand(
  name: string,
  serviceUUIDs: readonly string[] | null,
): boolean {
  if (BAND_NAME_PREFIXES.some((prefix) => name.startsWith(prefix))) return true;
  return (serviceUUIDs ?? []).some((uuid) =>
    BAND_SERVICES.includes(uuid.toLowerCase()),
  );
}
