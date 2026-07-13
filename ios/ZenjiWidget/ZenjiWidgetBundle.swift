//
//  ZenjiWidgetBundle.swift
//  ZenjiWidget
//
//  Widget extension entry point. WP-10 scaffold: one static placeholder
//  widget, same Tekst-TV tokens as the app. Real timeline data (the "next
//  must-see" precomputed from the App Group cache) arrives in WP-14.
//

import SwiftUI
import WidgetKit

@main
struct ZenjiWidgetBundle: WidgetBundle {
    var body: some Widget {
        ZenjiWidget()
    }
}
