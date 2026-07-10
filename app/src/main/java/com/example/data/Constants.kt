package com.example.data

/**
 * Centralized string constants for transaction categories and types.
 *
 * IMPORTANT: `Category.OPS` is the value stored in the database (legacy name)
 * while `Category.OPER` is the value shown in the UI. Do not rename one to the
 * other without a Room migration — existing rows use "OPS".
 */
object Category {
    // OUT categories
    const val CORE = "CORE"
    const val OPS = "OPS"     // stored value
    const val OPER = "OPER"   // UI display label
    const val HOBBY = "HOBBY"
    const val VAULT = "VAULT"

    // IN categories
    const val GAJI = "GAJI"
    const val KEBUN = "KEBUN"
    const val BONUS = "BONUS"
    const val LAINNYA = "LAINNYA"

    // Special
    const val TRANSFER = "TRANSFER"
}

object TxType {
    const val IN = "IN"
    const val OUT = "OUT"
    const val TRANSFER = "TRANSFER"
}

/**
 * Permanent delete of trash entries at or above this amount requires a typed
 * confirmation. Future Config UI may surface this as an actual setting; for
 * now it's a constant.
 */
const val BIG_DELETE_THRESHOLD = 1_000_000L
