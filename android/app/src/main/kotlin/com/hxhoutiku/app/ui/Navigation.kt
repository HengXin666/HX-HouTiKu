package com.hxhoutiku.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.hxhoutiku.app.ui.screen.feed.FeedScreen
import com.hxhoutiku.app.ui.screen.detail.MessageDetailScreen
import com.hxhoutiku.app.ui.screen.groups.GroupsScreen
import com.hxhoutiku.app.ui.screen.lock.LockScreen
import com.hxhoutiku.app.ui.screen.settings.SettingsScreen
import com.hxhoutiku.app.ui.screen.setup.SetupScreen
import com.hxhoutiku.app.ui.viewmodel.AuthViewModel

sealed class Screen(val route: String) {
    data object Loading : Screen("loading")
    data object Setup : Screen("setup")
    data object Lock : Screen("lock")
    data object Feed : Screen("feed")
    data object Groups : Screen("groups")
    data object GroupFeed : Screen("groups/{groupName}") {
        fun createRoute(groupName: String) = "groups/$groupName"
    }
    data object MessageDetail : Screen("message/{messageId}") {
        fun createRoute(id: String) = "message/$id"
    }
    data object Settings : Screen("settings")
}

@Composable
fun HxNavHost() {
    val navController = rememberNavController()
    val authVm: AuthViewModel = hiltViewModel()
    val authState by authVm.state.collectAsState()

    // React to auth state changes — navigate imperatively
    LaunchedEffect(authState) {
        when (authState) {
            AuthViewModel.AuthState.Loading -> { /* stay on loading screen */ }
            AuthViewModel.AuthState.NoKeys -> {
                navController.navigate(Screen.Setup.route) {
                    popUpTo(0) { inclusive = true }
                }
            }
            AuthViewModel.AuthState.Locked -> {
                navController.navigate(Screen.Lock.route) {
                    popUpTo(0) { inclusive = true }
                }
            }
            AuthViewModel.AuthState.Unlocked -> {
                navController.navigate(Screen.Feed.route) {
                    popUpTo(0) { inclusive = true }
                }
            }
        }
    }

    // Also listen to explicit nav events (lock/reset/setup-complete)
    LaunchedEffect(Unit) {
        authVm.navEvent.collect { event ->
            when (event) {
                AuthViewModel.NavEvent.GoToFeed -> {
                    navController.navigate(Screen.Feed.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
                AuthViewModel.NavEvent.GoToSetup -> {
                    navController.navigate(Screen.Setup.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
                AuthViewModel.NavEvent.GoToLock -> {
                    navController.navigate(Screen.Lock.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            }
        }
    }

    // Fixed startDestination — always "loading"
    NavHost(navController = navController, startDestination = Screen.Loading.route) {

        composable(Screen.Loading.route) {
            // Simple loading indicator while AuthViewModel determines state
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }

        composable(Screen.Setup.route) {
            SetupScreen(
                onSetupComplete = {
                    authVm.notifySetupComplete()
                }
            )
        }

        composable(Screen.Lock.route) {
            LockScreen(
                onUnlocked = {
                    navController.navigate(Screen.Feed.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Feed.route) {
            FeedScreen(
                onMessageClick = { id ->
                    navController.navigate(Screen.MessageDetail.createRoute(id))
                },
                onNavigateToGroups = {
                    navController.navigate(Screen.Groups.route)
                },
                onNavigateToSettings = {
                    navController.navigate(Screen.Settings.route)
                }
            )
        }

        composable(Screen.Groups.route) {
            GroupsScreen(
                onGroupClick = { group ->
                    navController.navigate(Screen.GroupFeed.createRoute(group))
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Screen.GroupFeed.route,
            arguments = listOf(navArgument("groupName") { type = NavType.StringType })
        ) { backStackEntry ->
            val groupName = backStackEntry.arguments?.getString("groupName") ?: ""
            FeedScreen(
                groupFilter = groupName,
                onMessageClick = { id ->
                    navController.navigate(Screen.MessageDetail.createRoute(id))
                },
                onNavigateToGroups = { navController.popBackStack() },
                onNavigateToSettings = {
                    navController.navigate(Screen.Settings.route)
                }
            )
        }

        composable(
            route = Screen.MessageDetail.route,
            arguments = listOf(navArgument("messageId") { type = NavType.StringType })
        ) { backStackEntry ->
            val messageId = backStackEntry.arguments?.getString("messageId") ?: ""
            MessageDetailScreen(
                messageId = messageId,
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Settings.route) {
            SettingsScreen(
                onBack = { navController.popBackStack() },
                onLock = {
                    authVm.lock()
                },
                onReset = {
                    authVm.reset()
                }
            )
        }
    }
}
