plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
}

// google-services plugin is only applied in the :app module when google-services.json exists.
// We do NOT declare it here to avoid resolution failures in environments without the artifact.
