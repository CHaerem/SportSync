//
//  NewsView.swift
//  Sportivista
//
//  WP-104 — the SHELL for the Nyheter side of the root segmented control
//  («Uka | Nyheter»). This ships the navigation first; the four-section board
//  (I DIN VERDEN I DAG · NYTT · RESULTAT · FREMOVER) is WP-106's job and fills
//  this file in bølge 2. For now it is a calm empty state with one dempet
//  setning — nothing more (DESIGN § Nyheter: én hjelpesetning maks; ingen
//  uleste-tellere, ingen engasjements-mekanikk).
//

import SwiftUI

struct NewsView: View {
    var body: some View {
        VStack {
            Spacer()
            Text("Nyheter om det du følger kommer snart.")
                .font(.sportivista(.subheadline))
                .foregroundStyle(SportivistaTokens.secondaryLabel)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 40)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SportivistaTokens.background)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("news.placeholder")
    }
}

#Preview {
    NewsView()
}
