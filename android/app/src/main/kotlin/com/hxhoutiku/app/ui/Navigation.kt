package com.hxhoutiku.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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

    val startDestination = when (authState) {
        AuthViewModel.AuthState.NoKeys -> Screen.Setup.route
        AuthViewModel.AuthState.Locked -> Screen.Lock.route
        is AuthViewModel.AuthState.Unlocked -> Screen.Feed.route
        AuthViewModel.AuthState.Loading -> Screen.Lock.route
    }

    NavHost(navController = navController, startDestination = startDestination) {
        composable(Screen.Setup.route) {
            SetupScreen(
                onSetupComplete = {
                    navController.navigate(Screen.Feed.route) {
                        popUpTo(Screen.Setup.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Lock.route) {
            LockScreen(
                onUnlocked = {
                    navController.navigate(Screen.Feed.route) {
                        popUpTo(Screen.Lock.route) { inclusive = true }
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
                    navController.navigate(Screen.Lock.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onReset = {
                    authVm.reset()
                    navController.navigate(Screen.Setup.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }
    }
}
