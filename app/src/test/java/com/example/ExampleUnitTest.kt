package com.example

import org.junit.Assert.*
import org.junit.Test

/**
 * Example local unit test, which will execute on the development machine (host).
 *
 * See [testing documentation](http://d.android.com/tools/testing).
 */
class ExampleUnitTest {
  @Test
  fun entryFormBudgetAllowsThreeQuickLogs() {
    val formMaxDp = 300
    val typicalPhoneHeightDp = 640
    val compactQuickLogRowDp = 44

    assertTrue(formMaxDp < typicalPhoneHeightDp / 2)
    assertTrue(typicalPhoneHeightDp - formMaxDp >= compactQuickLogRowDp * 3)
  }
}
