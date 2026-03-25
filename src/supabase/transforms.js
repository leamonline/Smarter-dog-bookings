/**
 * Convert DB rows to the component-friendly shapes the app expects.
 * Components use name-keyed maps and camelCase; DB uses UUID FKs and snake_case.
 */

export function dbHumansToMap(rows, trustedMap) {
  const map = {};
  for (const row of rows) {
    const key = `${row.name} ${row.surname}`;
    map[key] = {
      id: row.id,
      name: row.name,
      surname: row.surname,
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
      fullName: `${row.name} ${row.surname}`,
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

export function dbBookingsToArray(rows, dogsById, humansById) {
  return rows.map((row) => {
    const dog = dogsById[row.dog_id] || {};
    const ownerHuman = dog.human_id ? humansById[dog.human_id] : null;
    const pickupHuman = row.pickup_by_id ? humansById[row.pickup_by_id] : null;
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
      confirmed: row.confirmed || false,
      _dogId: row.dog_id,
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
  return date.toISOString().split("T")[0];
}
