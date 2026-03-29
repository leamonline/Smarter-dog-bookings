/**
 * Convert DB rows to the component-friendly shapes the app expects.
 * Components use name-keyed maps and camelCase; DB uses UUID FKs and snake_case.
 */

function buildHumanFullName(row) {
  return `${row.name} ${row.surname}`;
}

export function findHumanByIdOrName(humansById, humansOrValue, maybeValue) {
  const humans = maybeValue === undefined ? null : humansOrValue;
  const value = maybeValue === undefined ? humansOrValue : maybeValue;

  if (!value) return null;
  if (humansById?.[value]) return humansById[value];

  if (humans?.[value]) {
    const human = humans[value];
    return {
      id: human.id,
      name: human.name,
      surname: human.surname,
      phone: human.phone || "",
      sms: human.sms || false,
      whatsapp: human.whatsapp || false,
      email: human.email || "",
      fb: human.fb || "",
      insta: human.insta || "",
      tiktok: human.tiktok || "",
      address: human.address || "",
      notes: human.notes || "",
      history_flag: human.historyFlag || "",
      fullName:
        human.fullName || `${human.name || ""} ${human.surname || ""}`.trim(),
    };
  }

  const fromById = Object.values(humansById || {}).find(
    (human) => human.id === value || human.fullName === value,
  );
  if (fromById) return fromById;

  const fromMap = Object.values(humans || {}).find(
    (human) =>
      human.id === value ||
      human.fullName === value ||
      `${human.name || ""} ${human.surname || ""}`.trim() === value,
  );

  if (!fromMap) return null;

  return {
    id: fromMap.id,
    name: fromMap.name,
    surname: fromMap.surname,
    phone: fromMap.phone || "",
    sms: fromMap.sms || false,
    whatsapp: fromMap.whatsapp || false,
    email: fromMap.email || "",
    fb: fromMap.fb || "",
    insta: fromMap.insta || "",
    tiktok: fromMap.tiktok || "",
    address: fromMap.address || "",
    notes: fromMap.notes || "",
    history_flag: fromMap.historyFlag || "",
    fullName:
      fromMap.fullName ||
      `${fromMap.name || ""} ${fromMap.surname || ""}`.trim(),
  };
}

export function findDogByIdOrName(dogsById, dogs, value) {
  if (!value) return null;
  if (dogsById?.[value]) return dogsById[value];

  const fromMap = Object.values(dogs || {}).find(
    (dog) => dog.id === value || dog.name === value,
  );
  if (fromMap) {
    return {
      id: fromMap.id,
      name: fromMap.name,
      breed: fromMap.breed,
      age: fromMap.age || "",
      size: fromMap.size || null,
      human_id: fromMap._humanId || fromMap.humanId || null,
      alerts: fromMap.alerts || [],
      groom_notes: fromMap.groomNotes || "",
      custom_price: fromMap.customPrice,
    };
  }

  return (
    Object.values(dogsById || {}).find((dog) => dog.name === value) || null
  );
}

export function dbHumansToMap(rows, trustedMap) {
  const map = {};
  for (const row of rows) {
    const key = buildHumanFullName(row);
    map[key] = {
      id: row.id,
      name: row.name,
      surname: row.surname,
      fullName: key,
      phone: row.phone || "",
      sms: row.sms || false,
      whatsapp: row.whatsapp || false,
      email: row.email || "",
      fb: row.fb || "",
      insta: row.insta || "",
      tiktok: row.tiktok || "",
      address: row.address || "",
      notes: row.notes || "",
      historyFlag: row.history_flag || "",
      trustedIds: trustedMap[row.id] || [],
    };
  }
  return map;
}

export function buildHumansById(rows) {
  const byId = {};
  for (const row of rows) {
    byId[row.id] = {
      ...row,
      fullName: buildHumanFullName(row),
    };
  }
  return byId;
}

export function dbDogsToMap(rows, humansById) {
  const map = {};
  for (const row of rows) {
    const owner = humansById[row.human_id];
    map[row.name] = {
      id: row.id,
      name: row.name,
      breed: row.breed,
      age: row.age || "",
      size: row.size || null,
      humanId: owner ? owner.fullName : row.human_id,
      _humanId: row.human_id || null,
      alerts: row.alerts || [],
      groomNotes: row.groom_notes || "",
      customPrice: row.custom_price,
    };
  }
  return map;
}

export function buildDogsById(rows) {
  const byId = {};
  for (const row of rows) {
    byId[row.id] = row;
  }
  return byId;
}

export function dbBookingsToArray(rows, dogsById, humansById, humans = null) {
  return rows.map((row) => {
    const dog = dogsById[row.dog_id] || {};
    const ownerHuman = dog.human_id ? humansById[dog.human_id] : null;
    const pickupHuman = row.pickup_by_id
      ? findHumanByIdOrName(humansById, humans, row.pickup_by_id)
      : null;

    return {
      id: row.id,
      slot: row.slot,
      dogName: dog.name || "Unknown",
      breed: dog.breed || "",
      size: row.size,
      service: row.service,
      owner: ownerHuman?.fullName || "Unknown",
      status: row.status || "Not Arrived",
      addons: row.addons || [],
      pickupBy: pickupHuman?.fullName || ownerHuman?.fullName || "",
      payment: row.payment || "Due at Pick-up",
      confirmed: row.confirmed === true,
      _dogId: row.dog_id,
      _ownerId: dog.human_id || null,
      _pickupById: row.pickup_by_id,
      _bookingDate: row.booking_date,
    };
  });
}

export function dbConfigToApp(row) {
  if (!row) return null;
  return {
    defaultPickupOffset: row.default_pickup_offset || 120,
    pricing: row.pricing || {},
    enforceCapacity: row.enforce_capacity !== false,
    largeDogSlots: row.large_dog_slots || {},
  };
}

export function appConfigToDb(config) {
  return {
    default_pickup_offset: config.defaultPickupOffset,
    pricing: config.pricing,
    enforce_capacity: config.enforceCapacity,
    large_dog_slots: config.largeDogSlots,
  };
}

export function toDateStr(date) {
  if (typeof date === "string") return date;
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    if (import.meta.env?.DEV) console.warn("toDateStr received invalid date:", date);
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
